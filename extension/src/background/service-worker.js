// src/background/service-worker.js
//
// MV3 service worker — orchestrates the verification pipeline.
//
// Sprint 1/2 baseline:
//   Receive media URLs → fetch bytes → forward to Rust service → return results.
//
// Sprint 3 additions:
//   - chrome.alarms keepalive (24 s) prevents premature SW termination.
//   - Periodic health poll (30 s) persisted to session storage and broadcast.
//   - ScanQueue deduplicates in-flight URL verifications within 60 s.
//   - ResultCache short-circuits repeat verifications within 5 min.
//   - Bounded concurrency (SCAN_CONCURRENCY = 3).
//   - Per-item SCAN_PROGRESS messages for the popup progress bar.
//   - Graceful offline handling via circuit-breaker error codes.
//
// Sprint 3/4 realtime tracking additions:
//   - TabMediaRegistry stores all media detected per tab session.
//   - MEDIA_DETECTED now updates the registry and pushes MEDIA_UPDATED to popup.
//   - GET_TAB_MEDIA returns the current tab's full media list on demand.
//   - chrome.tabs.onRemoved clears registry when a tab closes.
//   - chrome.tabs.onUpdated clears registry on navigation (status: 'loading').
//
// Extension-only migration (Step 3/4):
//   - ipc-client.js import commented out — Step 4 replaces with offscreen messaging.
//   - Health poll removed — no Rust service to monitor.
//   - verifyOne() body commented out — Step 4 rewrites with offscreen delegation.

import { MSG, msg }         from '../shared/messages.js';
import { ResultCache }      from '../shared/result-cache.js';
import { ScanQueue }        from './scan-queue.js';
import { TabMediaRegistry } from './tab-media-registry.js';
import {
  STORAGE_KEYS,
  SUPPORTED_MIME_TYPES,
  MAX_ASSET_BYTES,
  SCAN_CONCURRENCY,
  KEEPALIVE_ALARM,
  KEEPALIVE_INTERVAL_MIN,
} from '../shared/constants.js';
// TODO Step 4: removed for extension-only migration
// import { verifyAsset, checkHealth } from '../shared/ipc-client.js';

// ---------------------------------------------------------------------------
// Module-level singletons (survive within one SW lifetime)
// ---------------------------------------------------------------------------

const scanQueue        = new ScanQueue({ maxAge: 60_000 });
const resultCache      = new ResultCache();
const tabMediaRegistry = new TabMediaRegistry();

// TODO Step 4: removed for extension-only migration
// let _lastHealth = null;

// ---------------------------------------------------------------------------
// MV3 keepalive alarm
// ---------------------------------------------------------------------------

function ensureAlarms() {
  chrome.alarms.get(KEEPALIVE_ALARM, alarm => {
    if (!alarm) chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: KEEPALIVE_INTERVAL_MIN });
  });
  // TODO Step 4: removed for extension-only migration
  // chrome.alarms.get(HEALTH_POLL_ALARM, alarm => {
  //   if (!alarm) chrome.alarms.create(HEALTH_POLL_ALARM, { periodInMinutes: HEALTH_POLL_INTERVAL_MIN });
  // });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM) return; // no-op; waking the SW is sufficient
  // TODO Step 4: removed for extension-only migration
  // if (alarm.name === HEALTH_POLL_ALARM) pollHealth().catch(console.error);
});

// ---------------------------------------------------------------------------
// Health monitoring — removed for extension-only migration
// ---------------------------------------------------------------------------

// TODO Step 4: removed for extension-only migration — no Rust service to monitor.
// async function pollHealth() {
//   let next;
//   try {
//     const data = await checkHealth();
//     next = { ok: true, version: data.version ?? '?', ts: Date.now() };
//   } catch {
//     next = { ok: false, ts: Date.now() };
//   }
//
//   const changed = !_lastHealth || _lastHealth.ok !== next.ok;
//   _lastHealth = next;
//
//   if (chrome.storage.session) {
//     chrome.storage.session
//       .set({ [STORAGE_KEYS.HEALTH_STATE]: next })
//       .catch(() => {});
//   }
//
//   if (changed) {
//     chrome.runtime.sendMessage(msg(MSG.HEALTH_STATUS_CHANGED, next)).catch(() => {});
//   }
//
//   return next;
// }

// ---------------------------------------------------------------------------
// Fetch utilities
// ---------------------------------------------------------------------------

async function fetchAsBytes(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}) for ${url}`);

  let mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim() ?? '';
  if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
    if      (/\.jpe?g(\?|$)/i.test(url)) mediaType = 'image/jpeg';
    else if (/\.png(\?|$)/i.test(url))   mediaType = 'image/png';
    else if (/\.gif(\?|$)/i.test(url))   mediaType = 'image/gif';
    else if (/\.webp(\?|$)/i.test(url))  mediaType = 'image/webp';
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`Asset too large (${buf.byteLength} bytes): ${url}`);
  }
  return { mediaType, bytes: new Uint8Array(buf) };
}

function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

// ---------------------------------------------------------------------------
// Verification pipeline (cache + queue + graceful errors)
// ---------------------------------------------------------------------------

async function verifyOne(url) {
  const cached = resultCache.get(url);
  if (cached) return { sourceUrl: url, ...cached, _cached: true };

  scanQueue.markInFlight(url);

  // TODO Step 4: removed for extension-only migration — rewrite with offscreen delegation.
  // The block below called the Rust HTTP service via ipc-client.js.
  // Step 4 will replace it with chrome.runtime.sendMessage(MSG.VERIFY_REQUEST)
  // to the offscreen document.
  //
  // try {
  //   const { mediaType, bytes } = await fetchAsBytes(url);
  //
  //   if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
  //     const record = { sourceUrl: url, status: 'unsupported_format', manifest: null, error: null };
  //     resultCache.set(url, { status: 'unsupported_format', manifest: null, error: null });
  //     scanQueue.markDone(url, record);
  //     return record;
  //   }
  //
  //   const dataBase64 = bytesToBase64(bytes);
  //   const apiResult  = await verifyAsset({ sourceUrl: url, mediaType, dataBase64 });
  //   const record     = { sourceUrl: url, ...apiResult, error: null };
  //
  //   resultCache.set(url, { status: apiResult.status, manifest: apiResult.manifest ?? null, error: null });
  //   scanQueue.markDone(url, record);
  //   return record;
  //
  // } catch (err) {
  //   const record = {
  //     sourceUrl: url,
  //     status:    'error',
  //     manifest:  null,
  //     error:     { code: err.code ?? 'UNKNOWN', message: err.message ?? String(err) },
  //   };
  //   scanQueue.markFailed(url, err);
  //   return record;
  // }

  // Temporary stub — replaced in Step 4 with real offscreen delegation.
  const record = { sourceUrl: url, status: 'error', manifest: null, error: { message: 'Step 4 not yet implemented' } };
  scanQueue.markFailed(url, new Error('Step 4 not yet implemented'));
  return record;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency runner
// ---------------------------------------------------------------------------

async function runConcurrent(tasks, limit) {
  if (tasks.length === 0) return [];
  const results = new Array(tasks.length);
  let   nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx    = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

// ---------------------------------------------------------------------------
// Active-tab scan (unchanged Sprint 3 logic)
// ---------------------------------------------------------------------------

async function scanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, msg(MSG.SCAN_ACTIVE_TAB));
  } catch {
    throw new Error(
      'Content script not ready — try reloading the page, then scanning again.'
    );
  }
  if (!response?.ok) throw new Error('Content script did not respond.');

  const mediaItems = response.media ?? [];
  const total      = mediaItems.length;
  let   done       = 0;

  const tasks = mediaItems.map(item => async () => {
    const res = await verifyOne(item.src);
    done++;
    chrome.runtime.sendMessage(
      msg(MSG.SCAN_PROGRESS, { done, total })
    ).catch(() => {});
    return { ...item, ...res, sourceUrl: res.sourceUrl ?? item.src };
  });

  const results = await runConcurrent(tasks, SCAN_CONCURRENCY);

  const summary = {
    pageUrl:   response.pageUrl,
    scannedAt: Date.now(),
    count:     results.length,
    results,
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: summary });
  return summary;
}

// ---------------------------------------------------------------------------
// Realtime tracking helpers
// ---------------------------------------------------------------------------

/**
 * Push the current media state for a tab to any open popup.
 * Silently no-ops if the popup is closed (sendMessage rejects).
 */
function broadcastMediaUpdate(tabId) {
  const media   = tabMediaRegistry.getAll(tabId);
  const pageUrl = tabMediaRegistry.getPageUrl(tabId);
  chrome.runtime.sendMessage(msg(MSG.MEDIA_UPDATED, {
    tabId,
    media,
    pageUrl,
    count: media.length,
  })).catch(() => {});
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ensureAlarms();

  // Capture tab ID before entering the async IIFE — sender stays valid in closure.
  const senderTabId = sender?.tab?.id ?? null;

  (async () => {
    try {
      switch (message?.type) {

        // ── Realtime tracking ────────────────────────────────────────────── //

        case MSG.MEDIA_DETECTED: {
          const { media = [], pageUrl = '' } = message.payload ?? {};
          if (senderTabId !== null) {
            const { newItems } = tabMediaRegistry.update(senderTabId, pageUrl, media);
            if (newItems.length > 0) {
              broadcastMediaUpdate(senderTabId);
            }
          }
          sendResponse({ ok: true });
          return;
        }

        case MSG.GET_TAB_MEDIA: {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) { sendResponse({ ok: false, error: 'No active tab.' }); return; }
          sendResponse({
            ok:      true,
            tabId:   tab.id,
            media:   tabMediaRegistry.getAll(tab.id),
            pageUrl: tabMediaRegistry.getPageUrl(tab.id),
            count:   tabMediaRegistry.getCount(tab.id),
          });
          return;
        }

        // ── Verification ─────────────────────────────────────────────────── //

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

        // TODO Step 4: removed for extension-only migration — no Rust service to test.
        // case MSG.TEST_SERVICE: {
        //   const health = await pollHealth();
        //   sendResponse({ ok: health.ok, health: { version: health.version, ts: health.ts } });
        //   return;
        // }

        case MSG.CLEAR_CACHE: {
          resultCache.clear();
          sendResponse({ ok: true, cleared: true });
          return;
        }

        case MSG.GET_QUEUE_STATUS: {
          sendResponse({ ok: true, queue: scanQueue.snapshot() });
          return;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
      }
    } catch (err) {
      console.error('[C2PA background] unhandled error in message handler:', err);
      sendResponse({ ok: false, error: err.message ?? String(err) });
    }
  })();

  return true;
});

// ---------------------------------------------------------------------------
// Tab lifecycle — keep the registry tidy
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaRegistry.clear(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // 'loading' fires once at the start of a top-level navigation.
  // Clear old media so the live panel resets for the new page.
  if (changeInfo.status === 'loading') {
    tabMediaRegistry.clear(tabId);
    // Notify any open popup so the live panel empties immediately.
    chrome.runtime.sendMessage(msg(MSG.MEDIA_UPDATED, {
      tabId, media: [], pageUrl: '', count: 0,
    })).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
  // TODO Step 4: removed for extension-only migration
  // pollHealth().catch(console.error);
  console.log('[C2PA background] extension installed / updated.');
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  // TODO Step 4: removed for extension-only migration
  // pollHealth().catch(console.error);
  console.log('[C2PA background] browser started.');
});

ensureAlarms();
console.log('[C2PA background] service worker started.');
