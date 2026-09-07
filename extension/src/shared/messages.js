// src/shared/messages.js
//
// Typed message-bus contract shared by content, background, and popup.
// All three extension layers must agree on these string values.

export const MSG = Object.freeze({
  // content-script → background
  MEDIA_DETECTED:  'c2pa/media_detected',

  // background → offscreen document (verification)
  VERIFY_REQUEST:  'c2pa/verify_request',   // { bytes: ArrayBuffer, mimeType: string }
  VERIFY_RESULT:   'c2pa/verify_result',    // reserved for future SW-side response routing

  // popup → background (on-demand actions)
  SCAN_ACTIVE_TAB:  'c2pa/scan_active_tab',
  GET_LAST_RESULT:  'c2pa/get_last_result',
  GET_TAB_MEDIA:    'c2pa/get_tab_media',    // { } → { tabId, media, pageUrl, count }

  // popup → background → content-script (relayed as-is to the active tab)
  SCROLL_TO_MEDIA:  'c2pa/scroll_to_media',  // { url, kind }

  // background → popup (push events)
  SCAN_PROGRESS:   'c2pa/scan_progress',    // { done, total }
  SCAN_COMPLETE:   'c2pa/scan_complete',    // { summary }
  MEDIA_UPDATED:   'c2pa/media_updated',    // { tabId, media, pageUrl, count }

  // Sprint 4 prep — cache & queue management
  CLEAR_CACHE:      'c2pa/clear_cache',
  GET_QUEUE_STATUS: 'c2pa/get_queue_status',
});

/**
 * Build a typed message envelope.
 * @param {string} type     One of MSG.*
 * @param {object} [payload]
 */
export function msg(type, payload = {}) {
  return { type, payload, ts: Date.now() };
}
