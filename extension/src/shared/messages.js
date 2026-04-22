// src/shared/messages.js
//
// Typed messages passed over chrome.runtime.sendMessage.
// Using a small enum keeps the three extension layers (content, background, popup) in sync.

export const MSG = Object.freeze({
  // content-script → background
  MEDIA_DETECTED:   'c2pa/media_detected',

  // popup → background
  SCAN_ACTIVE_TAB:  'c2pa/scan_active_tab',
  GET_LAST_RESULT:  'c2pa/get_last_result',
  TEST_SERVICE:     'c2pa/test_service',

  // background → popup
  SCAN_PROGRESS:    'c2pa/scan_progress',
  SCAN_COMPLETE:    'c2pa/scan_complete',
});

/**
 * Build a typed message envelope.
 * @param {string} type  One of MSG.*
 * @param {object} [payload]
 */
export function msg(type, payload = {}) {
  return { type, payload, ts: Date.now() };
}
