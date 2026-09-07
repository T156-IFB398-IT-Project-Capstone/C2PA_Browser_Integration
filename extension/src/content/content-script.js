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
  const MIN_REANNOUNCE_MS    = 2_000;  // rate-limit for realtime tracking messages

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
    // Detection is synchronous DOM querying — one shared timestamp for the
    // whole pass is accurate (no per-item detection cost to distinguish) and
    // gives the performance harness a "detection -> result" latency anchor.
    const detectedAt = Date.now();

    function add(rawUrl, kind, meta = {}) {
      if (!isVerifiableUrl(rawUrl) || seen.has(rawUrl)) return;
      seen.add(rawUrl);
      found.push({ src: rawUrl, kind, detectedAt, ...meta });
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
    return false;
  });

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
