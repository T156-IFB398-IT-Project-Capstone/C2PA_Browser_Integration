// src/content/content-script.js
//
// Content script — runs in the page context, cannot import ES modules.
//
// Sprint 1/2: discovered <img> elements with supported extensions.
// Sprint 3: added srcset, picture>source, video poster, MutationObserver.
// Sprint 3/4 (realtime tracking):
//   - discoverAllMedia() adds <video src>, <audio src>, <source> children,
//     and blob: URLs for the tracking pipeline.
//   - announce() now uses discoverAllMedia() so the background registry
//     receives every media kind, not just verifiable images.
//   - MIN_REANNOUNCE_MS reduced to 2 s for snappier live-panel updates.
//   - SCAN_ACTIVE_TAB still uses discoverMedia() (verifiable images only),
//     preserving full Sprint 1/2/3 backward compatibility.

(() => {
  'use strict';

  // --- inlined constants (no ES-module imports in classic content scripts) ---
  // Keep in sync with SUPPORTED_EXTENSIONS / SUPPORTED_MIME_TYPES in
  // ../shared/constants.js — this file can't import it (classic content script).
  const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4'];
  const MSG_MEDIA_DETECTED   = 'c2pa/media_detected';
  const MSG_SCAN_ACTIVE_TAB  = 'c2pa/scan_active_tab';
  const MSG_SCAN_COMPLETE    = 'c2pa/scan_complete';
  const MSG_SCROLL_TO_MEDIA  = 'c2pa/scroll_to_media';
  const MIN_REANNOUNCE_MS    = 2_000;  // rate-limit for realtime tracking messages

  // Badge selection runs on TWO axes:
  //
  //  1. Trust (VERIFY_STATUS, from the signature/cert chain).
  //  2. Content category (manifest.contentCategory, from action assertions —
  //     see offscreen.js classifyContent() for why this is independent of
  //     trust and can't be conflated with it).
  //
  // They combine asymmetrically, by design:
  //
  //  - ai_generated ALWAYS wins, at any trust tier down to and including
  //    content_tampered / broken_signature — as long as a manifest exists
  //    to read the disclosure from at all. A claim of AI origin is safer to
  //    over-show than to suppress behind a signature problem unrelated to
  //    the disclosure itself; CLAUDE.md constraint #4 already treats
  //    under-disclosure as the worse failure mode.
  //  - Every OTHER content category (authentic / edited / ai_edited) still
  //    requires a fully trusted signature (verified_trusted) before it's
  //    shown — a positive "authentic" claim needs the strongest evidence,
  //    not the weakest. Anything with a manifest but not trusted enough (or
  //    trusted with no readable action history) falls back to a single
  //    neutral "unverifiable" badge — detail lives in the popup, not
  //    guessed at here.
  //  - no_credentials / unsupported_format / error get no badge at all.
  //
  // Filenames match the values above; swap files in place to restyle,
  // no code change needed.
  const CONTENT_LOGO_FILES = {
    authentic:     'authentic.png',
    edited:        'edited.png',
    ai_edited:     'ai-edited.png',
    ai_generated:  'ai-generated.png',
  };
  const UNVERIFIABLE_LOGO_FILE = 'unverifiable.svg';

  // Manifest present, but not trusted enough to classify by content — see above.
  const UNVERIFIABLE_STATUSES = new Set([
    'verified_tsa', 'verified_untrusted', 'signing_expired',
    'content_tampered', 'broken_signature', 'invalid_or_changed',
  ]);

  const CONTENT_LOGO_URLS = Object.fromEntries(
    Object.entries(CONTENT_LOGO_FILES).map(
      ([category, file]) => [category, chrome.runtime.getURL(`icons/badges/${file}`)]
    )
  );
  const UNVERIFIABLE_LOGO_URL = chrome.runtime.getURL(`icons/badges/${UNVERIFIABLE_LOGO_FILE}`);

  /**
   * Pick { key, url } for a scan result, or null if nothing should show.
   * key is used both as the badge's dedupe/update marker and as its alt text.
   */
  function pickBadge(res) {
    const category = res.manifest?.contentCategory; // undefined whenever manifest is null

    // AI-generated disclosure bypasses the trust gate — see comment above.
    if (category === 'ai_generated') {
      return { key: 'ai_generated', url: CONTENT_LOGO_URLS.ai_generated };
    }

    if (res.status === 'verified_trusted') {
      const url = CONTENT_LOGO_URLS[category];
      if (url) return { key: category, url };
      // Trusted signature, but no readable action history to classify from.
      return { key: 'unverifiable', url: UNVERIFIABLE_LOGO_URL };
    }
    if (UNVERIFIABLE_STATUSES.has(res.status)) {
      return { key: 'unverifiable', url: UNVERIFIABLE_LOGO_URL };
    }
    return null; // no_credentials, unsupported_format, error
  }

  // -------------------------------------------------------------------------
  // URL helpers
  // -------------------------------------------------------------------------

  /** True only for http/https URLs with a verifiable (image or video) extension. */
  function isVerifiableUrl(url) {
    if (!url) return false;
    try {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      const path = new URL(url, window.location.href).pathname.toLowerCase();
      return SUPPORTED_EXTENSIONS.some(ext => path.endsWith(ext));
    } catch {
      return false;
    }
  }

  /** Resolve a raw src to an absolute URL; pass blob: as-is; reject data:. */
  function resolveUrl(rawUrl) {
    if (!rawUrl) return null;
    if (rawUrl.startsWith('data:')) return null;          // skip inline data
    if (rawUrl.startsWith('blob:')) return rawUrl;        // keep object URLs
    try {
      return new URL(rawUrl, window.location.href).href;
    } catch {
      return null;
    }
  }

  /** Parse a srcset attribute; return the raw URL strings (no descriptors). */
  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(',')
      .map(part => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // discoverMedia — verifiable media only (images since Sprint 1/2/3; video
  // added once the scan pipeline could handle MP4 — see SPIKE-001).
  // Used exclusively by SCAN_ACTIVE_TAB.
  // -------------------------------------------------------------------------

  function discoverMedia() {
    const found = [];
    const seen  = new Set();

    function add(rawUrl, kind, meta = {}) {
      if (!isVerifiableUrl(rawUrl) || seen.has(rawUrl)) return;
      seen.add(rawUrl);
      found.push({ src: rawUrl, kind, ...meta });
    }

    // :not([data-c2pa-badge-icon]) — exclude our own injected corner badges
    // (see addCornerBadge()) so they never appear as "media on the page".
    for (const el of document.querySelectorAll('img:not([data-c2pa-badge-icon])')) {
      const src = el.currentSrc || el.src;
      add(src, 'image', {
        alt:    el.alt           || '',
        width:  el.naturalWidth  || el.width  || 0,
        height: el.naturalHeight || el.height || 0,
      });
      for (const c of parseSrcset(el.getAttribute('srcset'))) add(c, 'image', { alt: el.alt || '' });
    }

    for (const el of document.querySelectorAll('picture source[srcset]')) {
      for (const c of parseSrcset(el.getAttribute('srcset'))) add(c, 'image', {});
    }

    for (const el of document.querySelectorAll('video[poster]')) {
      add(el.poster, 'video-poster', {});
    }

    // video src / currentSrc — filtered by isVerifiableUrl(), so blob:/MSE
    // sources (no fetchable URL) are excluded the same way data: URLs are
    // for images. Mirrors discoverAllMedia()'s video handling below.
    for (const el of document.querySelectorAll('video')) {
      add(el.currentSrc || el.src, 'video', {
        width:  el.videoWidth  || el.width  || 0,
        height: el.videoHeight || el.height || 0,
      });
    }

    // <video><source src> — .src (not getAttribute) so a relative path
    // resolves to absolute the same way img.src/video.src already do above.
    for (const el of document.querySelectorAll('video > source')) {
      add(el.src, 'video', {});
    }

    return found;
  }

  // -------------------------------------------------------------------------
  // discoverAllMedia — Sprint 3/4 tracking (all media kinds)
  // Used by announce() → MEDIA_DETECTED → TabMediaRegistry in the background.
  // Includes videos, audios, and blob: URLs that cannot be verified but should
  // appear in the realtime tracking panel.
  // -------------------------------------------------------------------------

  function discoverAllMedia() {
    const found = [];
    const seen  = new Set();

    function push(rawUrl, kind, meta = {}) {
      const url = resolveUrl(rawUrl);
      if (!url || seen.has(url)) return;
      seen.add(url);
      found.push({ src: url, kind, verifiable: isVerifiableUrl(url), ...meta });
    }

    // --- Images -----------------------------------------------------------

    // :not([data-c2pa-badge-icon]) — exclude our own injected corner badges
    // (see addCornerBadge()) so they never appear as "media on the page".
    for (const el of document.querySelectorAll('img:not([data-c2pa-badge-icon])')) {
      const src = el.currentSrc || el.src;
      if (src) push(src, 'image', {
        alt:    el.alt           || '',
        width:  el.naturalWidth  || el.width  || 0,
        height: el.naturalHeight || el.height || 0,
      });
      for (const c of parseSrcset(el.getAttribute('srcset') || '')) push(c, 'image', { alt: el.alt || '' });
    }

    for (const el of document.querySelectorAll('picture source[srcset]')) {
      for (const c of parseSrcset(el.getAttribute('srcset') || '')) push(c, 'image', {});
    }

    // --- Video ------------------------------------------------------------

    // poster still-image (may carry C2PA)
    for (const el of document.querySelectorAll('video[poster]')) {
      if (el.poster) push(el.poster, 'video-poster', {});
    }

    // video src / currentSrc (includes blob: streams from MSE)
    for (const el of document.querySelectorAll('video')) {
      const src = el.currentSrc || el.getAttribute('src');
      if (src) push(src, 'video', {
        width:  el.videoWidth  || el.width  || 0,
        height: el.videoHeight || el.height || 0,
      });
    }

    // <video><source src>
    for (const el of document.querySelectorAll('video > source[src]')) {
      const src = el.getAttribute('src');
      if (src) push(src, 'video', {});
    }

    // --- Audio ------------------------------------------------------------

    for (const el of document.querySelectorAll('audio')) {
      const src = el.currentSrc || el.getAttribute('src');
      if (src) push(src, 'audio', {});
    }

    for (const el of document.querySelectorAll('audio > source[src]')) {
      const src = el.getAttribute('src');
      if (src) push(src, 'audio', {});
    }

    return found;
  }

  // -------------------------------------------------------------------------
  // Message listener — responds to on-demand scan requests from the popup
  // -------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MSG_SCAN_ACTIVE_TAB) {
      // Verification pipeline: only return verifiable images (Sprint 1/2/3 contract)
      const media = discoverMedia();
      sendResponse({ ok: true, media, pageUrl: window.location.href });
      return true;
    }

    if (message?.type === MSG_SCAN_COMPLETE) {
      // Background finished verifying — annotate any <img> whose result
      // resolves to a badge (see pickBadge: trust-gated content category,
      // or "unverifiable", or nothing).
      const results = message.payload?.summary?.results ?? [];
      for (const res of results) {
        const badge = pickBadge(res);
        if (!badge) continue;
        const img = findImageForUrl(res.sourceUrl);
        if (img) addCornerBadge(img, badge.key, badge.url, res);
      }
      return false;
    }

    if (message?.type === MSG_SCROLL_TO_MEDIA) {
      // Popup's Live Media list asked to jump to a specific element.
      const { url, kind } = message.payload ?? {};
      const el = findElementForMediaUrl(url, kind);
      console.debug('[C2PA content] scroll-to-media', { url, kind, found: !!el });
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashHighlight(el);
      } else {
        console.warn('[C2PA content] scroll-to-media: no matching element for', url);
      }
      sendResponse({ ok: true, found: !!el });
      return false;
    }

    return false;
  });

  // -------------------------------------------------------------------------
  // Live-media scroll-to — locate the on-page element behind a registry
  // entry (which may be any kind discoverAllMedia() tracks, not just <img>)
  // and briefly flash it so it's easy to spot once scrolled into view.
  // -------------------------------------------------------------------------

  function findElementForMediaUrl(url, kind) {
    if (!url) return null;

    if (kind === 'video') {
      for (const el of document.querySelectorAll('video')) {
        if ((el.currentSrc || el.src) === url) return el;
      }
      for (const el of document.querySelectorAll('video > source[src]')) {
        if (el.src === url) return el.closest('video') ?? el;
      }
      return null;
    }

    if (kind === 'video-poster') {
      for (const el of document.querySelectorAll('video[poster]')) {
        if (el.poster === url) return el;
      }
      return null;
    }

    if (kind === 'audio') {
      for (const el of document.querySelectorAll('audio')) {
        if ((el.currentSrc || el.src) === url) return el;
      }
      for (const el of document.querySelectorAll('audio > source[src]')) {
        if (el.src === url) return el.closest('audio') ?? el;
      }
      return null;
    }

    // image / gif / default
    return findImageForUrl(url);
  }

  /** Briefly outline `el` (its own inline style, reverted after a beat) so a scrolled-to element is easy to spot. */
  function flashHighlight(el, durationMs = 1500) {
    const prev = { outline: el.style.outline, outlineOffset: el.style.outlineOffset, transition: el.style.transition };
    el.style.transition = 'outline-color 0.2s ease';
    el.style.outline = '3px solid #4da3ff';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = prev.outline;
      el.style.outlineOffset = prev.outlineOffset;
      el.style.transition = prev.transition;
    }, durationMs);
  }

  // -------------------------------------------------------------------------
  // Corner badge — one icon per pickBadge() result (see CONTENT_LOGO_FILES).
  // -------------------------------------------------------------------------

  /**
   * Find the on-page <img> whose resolved src, OR any srcset candidate
   * (its own, or its enclosing <picture>'s <source> candidates), matches
   * `url`. Needed because discoverAllMedia()/discoverMedia() push every
   * srcset candidate as its own entry, but only ONE of them is ever the
   * element's actual currentSrc — everything else previously matched
   * nothing and silently failed to scroll/badge.
   */
  function findImageForUrl(url) {
    if (!url) return null;

    for (const img of document.querySelectorAll('img')) {
      if ((img.currentSrc || img.src) === url) return img;
      if (srcsetMatches(img.getAttribute('srcset'), url)) return img;
    }

    for (const source of document.querySelectorAll('picture source[srcset]')) {
      if (srcsetMatches(source.getAttribute('srcset'), url)) {
        const img = source.closest('picture')?.querySelector('img');
        if (img) return img;
      }
    }

    return null;
  }

  /** True if any candidate URL in a srcset attribute resolves to `url`. */
  function srcsetMatches(srcset, url) {
    if (!srcset) return false;
    for (const raw of parseSrcset(srcset)) {
      try {
        if (new URL(raw, window.location.href).href === url) return true;
      } catch {
        if (raw === url) return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Plain-language summary + structured facts, for the hover tooltip and the
  // "More detail" modal. Wording follows CLAUDE.md constraint #4: describe
  // what was checked, not a truth verdict — no "safe"/"fake", just what the
  // credential does and doesn't establish.
  // -------------------------------------------------------------------------

  // Each entry is a standalone clause describing the SIGNATURE/CERT check
  // only — deliberately doesn't restate who signed it (that's a separate
  // "Signed by" fact/sentence) so callers can compose it after a signer
  // name without producing "Signed by X, but signed by an issuer..." dupes.
  const TRUST_STATUS_TEXT = {
    verified_trusted:   'This signature is fully verified against a trusted issuer.',
    verified_tsa:        "This signing certificate isn't on our trust list, but a trusted timestamp confirms when it was signed.",
    verified_untrusted:  'This signature is valid, but the signing certificate is not on our trust list.',
    signing_expired:     'This signing certificate has expired.',
    content_tampered:    "This image's content doesn't match what its credential describes.",
    broken_signature:    "This credential's signature could not be validated.",
    invalid_or_changed:  'This credential could not be validated.',
  };

  const CATEGORY_LABEL = {
    authentic: 'Authentic', edited: 'Edited', ai_edited: 'AI-Edited', ai_generated: 'AI-Generated',
  };

  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  /** @returns {{ headline: string, body: string }} for the hover tooltip. */
  function summarizeResult(badgeKey, res) {
    const m = res.manifest || {};
    const signerName = m.signer?.common_name;
    const trustLine = TRUST_STATUS_TEXT[res.status] ?? 'Verification status unknown.';

    if (badgeKey === 'ai_generated') {
      let body = 'This image discloses it was created using AI.';
      body += res.status === 'verified_trusted'
        ? (signerName ? ` Signed by ${signerName}.` : '')
        : ` Its signing credential isn't fully verified — ${lowerFirst(trustLine)}`;
      return { headline: 'Discloses AI generation', body };
    }

    if (badgeKey === 'unverifiable') {
      const body = signerName ? `Signed by ${signerName}. ${trustLine}` : trustLine;
      return { headline: "Can't confirm the signer", body };
    }

    // authentic / edited / ai_edited — only reachable when fully trusted.
    const categoryLine = {
      authentic: 'shows no edits beyond capture',
      edited:    'shows it was edited (e.g. cropping, resizing)',
      ai_edited: 'discloses AI was used to modify it',
    }[badgeKey] ?? 'has a known content history';
    const headline = {
      authentic: 'Fully verified', edited: 'Fully verified — edited', ai_edited: 'Fully verified — AI-edited',
    }[badgeKey] ?? 'Fully verified';
    let body = `This image's content credential is fully verified and ${categoryLine}.`;
    if (signerName) body += ` Signed by ${signerName}.`;
    return { headline, body };
  }

  /** @returns {[string, string][]} label/value rows for the "More detail" modal. */
  function buildFacts(badgeKey, res) {
    const m = res.manifest || {};
    const rows = [['Trust status', TRUST_STATUS_TEXT[res.status] ?? res.status]];
    if (m.signer?.common_name) rows.push(['Signed by', m.signer.common_name]);
    if (m.signer?.issuer) rows.push(['Issuer', m.signer.issuer]);
    if (m.signer?.time) {
      const d = new Date(m.signer.time);
      rows.push(['Signed at', Number.isNaN(d.getTime()) ? m.signer.time : d.toLocaleString()]);
    }
    if (m.tsa_info) rows.push(['Timestamp', m.tsa_info.validated ? 'Trusted' : 'Not validated']);
    if (Array.isArray(m.contentHistory) && m.contentHistory.length) {
      rows.push(['Content history', m.contentHistory.join(' → ')]);
    }
    if (m.contentCategory) {
      const label = CATEGORY_LABEL[m.contentCategory] ?? m.contentCategory;
      const isShown = badgeKey === m.contentCategory;
      rows.push(['Content category', isShown ? label : `${label} (not shown as a badge — requires a fully trusted signature first)`]);
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Hover tooltip + "More detail" modal — injected DOM, so every element
  // resets with `all:initial` then re-declares what it needs. Same defensive
  // pattern as the badge itself: host-page CSS (e.g. a bare `button` or
  // `table` rule) must not bleed into UI we inject. See the corner-badge
  // black-background bug this was written to avoid a repeat of.
  // -------------------------------------------------------------------------

  const RESET = 'all:initial;box-sizing:border-box;font-family:system-ui,sans-serif;';

  function buildTooltip(wrapper) {
    const tooltip = document.createElement('div');
    tooltip.dataset.c2paTooltip = '1';
    tooltip.style.cssText =
      RESET +
      'display:block;position:absolute;right:4px;bottom:36px;width:240px;' +
      'background:#26262a;color:#eee;border:1px solid #3a3a3f;border-radius:10px;' +
      'padding:12px 12px 34px 12px;font-size:12px;line-height:1.5;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;pointer-events:none;' +
      'transform:translateY(4px);transition:opacity .12s ease,transform .12s ease;' +
      'z-index:2147483647;';

    const headline = document.createElement('strong');
    headline.style.cssText = RESET + 'display:block;margin-bottom:4px;font-size:12px;font-weight:700;color:#fff;';

    const body = document.createElement('span');
    body.style.cssText = RESET + 'display:block;font-size:12px;color:#cfcfd4;';

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.textContent = 'More detail';
    moreBtn.style.cssText =
      RESET +
      'position:absolute;right:10px;bottom:10px;background:#3a3a3f;color:#eee;' +
      'border:none;border-radius:6px;font-size:11px;padding:5px 9px;cursor:pointer;';
    moreBtn.addEventListener('mouseenter', () => { moreBtn.style.background = '#48484e'; });
    moreBtn.addEventListener('mouseleave', () => { moreBtn.style.background = '#3a3a3f'; });

    tooltip.append(headline, body, moreBtn);
    wrapper.appendChild(tooltip);

    const refs = { headline, body, moreBtn };
    tooltip._c2paRefs = refs;
    return { tooltip, ...refs };
  }

  function ensureTooltipEls(wrapper) {
    const existing = wrapper.querySelector(':scope > [data-c2pa-tooltip]');
    if (existing?._c2paRefs) return { tooltip: existing, ...existing._c2paRefs };
    return buildTooltip(wrapper);
  }

  function showTooltip(tooltip) {
    tooltip.style.opacity = '1';
    tooltip.style.pointerEvents = 'auto';
    tooltip.style.transform = 'translateY(0)';
  }
  function hideTooltip(tooltip) {
    tooltip.style.opacity = '0';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.transform = 'translateY(4px)';
  }

  // Single shared modal for the whole page — reused across every badge's
  // "More detail" click rather than one per image.
  let sharedModal = null;

  function ensureModal() {
    if (sharedModal) return sharedModal;

    const backdrop = document.createElement('div');
    backdrop.dataset.c2paModalBackdrop = '1';
    backdrop.style.cssText =
      RESET +
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);' +
      'align-items:center;justify-content:center;z-index:2147483647;';

    const modal = document.createElement('div');
    modal.style.cssText =
      RESET +
      'display:block;position:relative;background:#202023;color:#eee;border-radius:12px;' +
      'width:min(420px,90vw);max-height:80vh;overflow:auto;padding:20px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.6);';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.cssText =
      RESET + 'float:right;background:none;border:none;color:#999;font-size:20px;line-height:1;cursor:pointer;';
    closeBtn.addEventListener('click', () => { backdrop.style.display = 'none'; });

    const title = document.createElement('h2');
    title.style.cssText = RESET + 'display:block;margin:0 0 12px;font-size:15px;font-weight:700;color:#fff;';

    const table = document.createElement('table');
    table.style.cssText = RESET + 'display:table;width:100%;border-collapse:collapse;font-size:12px;';

    modal.append(closeBtn, title, table);
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.style.display = 'none'; });
    document.body.appendChild(backdrop);

    sharedModal = { backdrop, title, table };
    return sharedModal;
  }

  function openModal(badgeKey, res) {
    const { backdrop, title, table } = ensureModal();

    let filename = res.sourceUrl;
    try { filename = new URL(res.sourceUrl).pathname.split('/').pop() || res.sourceUrl; } catch { /* keep raw */ }
    title.textContent = filename;

    table.innerHTML = '';
    for (const [key, value] of buildFacts(badgeKey, res)) {
      const tr = document.createElement('tr');
      tr.style.cssText = RESET + 'display:table-row;border-bottom:1px solid #2f2f33;';

      const tdKey = document.createElement('td');
      tdKey.style.cssText =
        RESET + 'display:table-cell;padding:8px 10px 8px 0;color:#999;white-space:nowrap;vertical-align:top;';
      tdKey.textContent = key;

      const tdVal = document.createElement('td');
      tdVal.style.cssText = RESET + 'display:table-cell;padding:8px 0;color:#eee;vertical-align:top;';
      tdVal.textContent = value;

      tr.append(tdKey, tdVal);
      table.appendChild(tr);
    }

    backdrop.style.display = 'flex';
  }

  /**
   * Wrap `imgEl` in a positioned span, pin a small status badge to its
   * bottom-right corner, and wire up the hover tooltip + "More detail" modal.
   * Re-scanning with a different result updates everything in place.
   */
  function addCornerBadge(imgEl, badgeKey, logoUrl, res, size = 28, margin = 4) {
    if (!imgEl) return;

    if (imgEl.dataset.c2paBadge === badgeKey) return; // already showing this badge

    let wrapper = imgEl.parentElement;
    let badge = wrapper?.dataset?.c2paBadgeWrapper === '1'
      ? wrapper.querySelector(':scope > img[data-c2pa-badge-icon]')
      : null;

    if (!wrapper || wrapper.dataset.c2paBadgeWrapper !== '1') {
      wrapper = document.createElement('span');
      wrapper.dataset.c2paBadgeWrapper = '1';
      // Host-page stylesheets can target bare `img`/`span` selectors (e.g.
      // lazy-load placeholder styles) and bleed into whatever we inject here.
      // Inline styles beat any non-!important external rule, so pin every
      // property a host page is likely to set, not just the ones we need.
      wrapper.style.cssText =
        'all:initial;display:inline-block;position:relative;line-height:0;' +
        'background:transparent;border:none;box-shadow:none;padding:0;margin:0;';
      imgEl.parentNode.insertBefore(wrapper, imgEl);
      wrapper.appendChild(imgEl);
    }

    if (!badge) {
      badge = document.createElement('img');
      badge.dataset.c2paBadgeIcon = '1';
      badge.style.cssText =
        'all:initial;position:absolute;' +
        `right:${margin}px;bottom:${margin}px;` +
        `width:${size}px;height:${size}px;object-fit:contain;` +
        'background:transparent;border:none;box-shadow:none;padding:0;margin:0;' +
        'cursor:pointer;pointer-events:auto;z-index:2147483647;';
      wrapper.appendChild(badge);
    }

    badge.src = logoUrl;
    badge.alt = `C2PA status: ${badgeKey}`;

    const { tooltip, headline, body, moreBtn } = ensureTooltipEls(wrapper);
    const summary = summarizeResult(badgeKey, res);
    headline.textContent = summary.headline;
    body.textContent = summary.body;

    // Re-assign (not addEventListener) each call so re-scans don't stack
    // handlers holding stale `res` closures.
    badge.onmouseenter = () => showTooltip(tooltip);
    badge.onmouseleave = () => hideTooltip(tooltip);
    tooltip.onmouseenter = () => showTooltip(tooltip); // stay open while moving onto it
    tooltip.onmouseleave = () => hideTooltip(tooltip);
    moreBtn.onclick = (e) => { e.stopPropagation(); openModal(badgeKey, res); };

    imgEl.dataset.c2paBadge = badgeKey;
  }

  // -------------------------------------------------------------------------
  // Passive announcer — sends ALL media (images + video + audio + blobs) to
  // the background for the realtime tracking registry.
  // Rate-limited to MIN_REANNOUNCE_MS so busy pages don't flood the SW.
  // -------------------------------------------------------------------------

  let _lastAnnounceTs = 0;

  function announce() {
    const now = Date.now();
    if (now - _lastAnnounceTs < MIN_REANNOUNCE_MS) return;
    _lastAnnounceTs = now;

    try {
      const media = discoverAllMedia();
      // Always send even if empty so background can detect navigation-induced drops.
      chrome.runtime.sendMessage({
        type:    MSG_MEDIA_DETECTED,
        payload: { media, pageUrl: window.location.href },
        ts:      now,
      }).catch(() => {
        // Background may not be ready — best-effort hint.
      });
    } catch (err) {
      console.warn('[C2PA content] announce failed:', err);
    }
  }

  // Initial announcement once the page is idle.
  announce();

  // Watch for dynamically-inserted media (SPAs, lazy-loaded content, infinite scroll).
  // Debounce: wait 1 s after the last mutation, then re-announce.
  let _debounceTimer = null;

  const _observer = new MutationObserver(() => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(announce, 1_000);
  });

  _observer.observe(document.body, {
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['src', 'srcset', 'poster', 'currentSrc'],
  });
})();
