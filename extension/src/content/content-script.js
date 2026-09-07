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

    for (const el of document.querySelectorAll('img')) {
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

    for (const el of document.querySelectorAll('img')) {
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
        if (img) addCornerBadge(img, badge.key, badge.url);
      }
      return false;
    }

    return false;
  });

  // -------------------------------------------------------------------------
  // Corner badge — one icon per pickBadge() result (see CONTENT_LOGO_FILES).
  // -------------------------------------------------------------------------

  /** Find the on-page <img> whose resolved src matches a verified URL. */
  function findImageForUrl(url) {
    if (!url) return null;
    for (const img of document.querySelectorAll('img')) {
      if ((img.currentSrc || img.src) === url) return img;
    }
    return null;
  }

  /**
   * Wrap `imgEl` in a positioned span and pin a small status badge to its
   * bottom-right corner, without disturbing the surrounding page layout.
   * Re-scanning with a different status swaps the existing badge in place.
   */
  function addCornerBadge(imgEl, status, logoUrl, size = 28, margin = 4) {
    if (!imgEl) return;

    if (imgEl.dataset.c2paBadge === status) return; // already showing this status

    let wrapper = imgEl.parentElement;
    let badge = wrapper?.dataset?.c2paBadgeWrapper === '1'
      ? wrapper.querySelector(':scope > img[data-c2pa-badge-icon]')
      : null;

    if (!wrapper || wrapper.dataset.c2paBadgeWrapper !== '1') {
      wrapper = document.createElement('span');
      wrapper.dataset.c2paBadgeWrapper = '1';
      wrapper.style.cssText = 'display:inline-block;position:relative;line-height:0;';
      imgEl.parentNode.insertBefore(wrapper, imgEl);
      wrapper.appendChild(imgEl);
    }

    if (!badge) {
      badge = document.createElement('img');
      badge.dataset.c2paBadgeIcon = '1';
      badge.style.cssText =
        `position:absolute;right:${margin}px;bottom:${margin}px;` +
        `width:${size}px;height:${size}px;object-fit:contain;` +
        `pointer-events:none;z-index:2147483647;`;
      wrapper.appendChild(badge);
    }

    badge.src = logoUrl;
    badge.alt = `C2PA status: ${status}`;

    imgEl.dataset.c2paBadge = status;
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
