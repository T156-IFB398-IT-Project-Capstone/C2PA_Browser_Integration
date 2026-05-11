// src/background/service-worker.js
//
// MV3 service worker. Orchestrates the verification pipeline:
//   1. Receive media URLs from the content script or on-demand from the popup.
//   2. Fetch each asset as bytes.
//   3. Forward to the local Rust service via IPC.
//   4. Return structured results to the popup.
//
// MV3 service workers are event-driven and may be terminated between events.
// Persist anything that must survive termination in chrome.storage.local.

import { MSG, msg } from '../shared/messages.js';
import { STORAGE_KEYS, SUPPORTED_MIME_TYPES, MAX_ASSET_BYTES } from '../shared/constants.js';
import { verifyAsset, checkHealth } from '../shared/ipc-client.js';

// --- utilities ---------------------------------------------------------------

/**
 * Fetch an asset URL and return { mediaType, bytes }.
 */
async function fetchAsBytes(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }

  // Prefer the server's Content-Type; fall back to extension-based inference.
  let mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim() || '';
  if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
    if (/\.png(\?|$)/i.test(url))           mediaType = 'image/png';
    else if (/\.jpe?g(\?|$)/i.test(url))    mediaType = 'image/jpeg';
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`Asset exceeds maximum size (${arrayBuffer.byteLength} bytes): ${url}`);
  }
  return { mediaType, bytes: new Uint8Array(arrayBuffer) };
}

/**
 * Convert a Uint8Array to a base64 string without blowing the stack.
 */
function bytesToBase64(bytes) {
  const CHUNK = 0x8000; // 32 KB
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

/**
 * Send one asset through the pipeline. Returns a result record.
 */
async function verifyOne(url) {
  try {
    const { mediaType, bytes } = await fetchAsBytes(url);
    if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
      return { sourceUrl: url, status: 'unsupported_format', error: null };
    }
    const dataBase64 = bytesToBase64(bytes);
    const result = await verifyAsset({ sourceUrl: url, mediaType, dataBase64 });
    return { sourceUrl: url, ...result, error: null };
  } catch (err) {
    return {
      sourceUrl: url,
      status: 'error',
      error: {
        code:    err.code ?? 'UNKNOWN',
        message: err.message ?? String(err),
      },
    };
  }
}

/**
 * Ask the active tab's content script for its list of detected media,
 * then run them through the pipeline.
 */
async function scanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');

  const response = await chrome.tabs.sendMessage(tab.id, msg(MSG.SCAN_ACTIVE_TAB));
  if (!response?.ok) throw new Error('Content script did not respond.');

  const results = [];
  for (const item of response.media) {
    const res = await verifyOne(item.src);
    results.push({ ...item, ...res });
  }
  const summary = {
    pageUrl: response.pageUrl,
    scannedAt: Date.now(),
    count: results.length,
    results,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: summary });
  return summary;
}

// --- message router ----------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case MSG.MEDIA_DETECTED: {
          // Passive announcement from the content script. No immediate action;
          // we wait for the user to trigger a scan.
          sendResponse({ ok: true });
          return;
        }

        case MSG.SCAN_ACTIVE_TAB: {
          const summary = await scanActiveTab();
          sendResponse({ ok: true, summary });
          return;
        }

        case MSG.GET_LAST_RESULT: {
          const stored = await chrome.storage.local.get(STORAGE_KEYS.LAST_SCAN);
          sendResponse({ ok: true, summary: stored[STORAGE_KEYS.LAST_SCAN] ?? null });
          return;
        }

        case MSG.TEST_SERVICE: {
          const health = await checkHealth();
          sendResponse({ ok: true, health });
          return;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
      }
    } catch (err) {
      console.error('[C2PA background] handler error:', err);
      sendResponse({ ok: false, error: err.message ?? String(err) });
    }
  })();
  return true; // keep the channel open for async response
});

// Log on cold start so developers can see the worker waking up.
console.log('[C2PA background] service worker started.');
