// src/content/content-script.js
//
// Content script runs in the page context.
// Responsibility: find candidate media on the page, filter to supported formats,
// and report them to the background service worker.
//
// IMPORTANT: content scripts cannot directly import ES modules (as of MV3).
// We inline the few constants we need instead of cross-importing.

(() => {
  'use strict';

  const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
  const MSG_MEDIA_DETECTED   = 'c2pa/media_detected';
  const MSG_SCAN_ACTIVE_TAB  = 'c2pa/scan_active_tab';

  /**
   * Return true if the given URL looks like a supported media asset.
   */
  function isSupported(url) {
    if (!url) return false;
    try {
      // Resolve relative URLs. Data URIs and blob: are skipped for Sprint 2.
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      const u = new URL(url, window.location.href);
      const path = u.pathname.toLowerCase();
      return SUPPORTED_EXTENSIONS.some((ext) => path.endsWith(ext));
    } catch {
      return false;
    }
  }

  /**
   * Find all candidate images on the page.
   * @returns {Array<{ src: string, alt: string, rect: DOMRect }>}
   */
  function discoverMedia() {
    const nodes = document.querySelectorAll('img');
    const found = [];
    const seen = new Set();
    for (const el of nodes) {
      const src = el.currentSrc || el.src;
      if (!isSupported(src) || seen.has(src)) continue;
      seen.add(src);
      found.push({
        src,
        alt: el.alt || '',
        width: el.naturalWidth || el.width || 0,
        height: el.naturalHeight || el.height || 0,
      });
    }
    return found;
  }

  /**
   * Respond to on-demand scan requests from the popup (routed via background).
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MSG_SCAN_ACTIVE_TAB) {
      const media = discoverMedia();
      sendResponse({ ok: true, media, pageUrl: window.location.href });
      return true; // keep the channel open for the async response
    }
    return false;
  });

  // Passive discovery: announce initial findings once the page is idle.
  // The background may choose to ignore this until the user opts in.
  try {
    const initial = discoverMedia();
    if (initial.length > 0) {
      chrome.runtime.sendMessage({
        type: MSG_MEDIA_DETECTED,
        payload: { media: initial, pageUrl: window.location.href },
        ts: Date.now(),
      }).catch(() => {
        // Background may not be ready; ignore.
      });
    }
  } catch (err) {
    console.warn('[C2PA content] initial scan failed:', err);
  }
})();
