// src/background/service-worker.js
//
// MV3 service worker — orchestrates the verification pipeline.
//
// Architecture (extension-only, Step 4+):
//   Content script detects media URLs → SW fetches bytes → delegates to
//   offscreen document via MSG.VERIFY_REQUEST → offscreen runs c2pa-web WASM
//   → SW receives { status, manifest } → caches result → popup renders.
//
// Sprint 3 additions retained:
//   - chrome.alarms keepalive (24 s) prevents premature SW termination.
//   - ScanQueue deduplicates in-flight URL verifications within 60 s.
//   - ResultCache short-circuits repeat verifications within 5 min.
//   - Bounded concurrency (SCAN_CONCURRENCY = 3).
//   - Per-item SCAN_PROGRESS messages for the popup progress bar.
//
// Sprint 3/4 realtime tracking retained:
//   - TabMediaRegistry stores all media detected per tab session.
//   - MEDIA_DETECTED updates the registry and pushes MEDIA_UPDATED to popup.
//   - GET_TAB_MEDIA returns the current tab's full media list on demand.
//   - chrome.tabs.onRemoved / onUpdated keep the registry tidy.

import { MSG, msg } from '../shared/messages.js';
import { ResultCache } from '../shared/result-cache.js';
import { ScanQueue } from './scan-queue.js';
import { TabMediaRegistry } from './tab-media-registry.js';
import {
  STORAGE_KEYS,
  SUPPORTED_MIME_TYPES,
  MAX_ASSET_BYTES,
  SCAN_CONCURRENCY,
  KEEPALIVE_ALARM,
  KEEPALIVE_INTERVAL_MIN,
  OFFSCREEN_URL,
  OFFSCREEN_REASON,
  VERIFY_STATUS,
  PERF_LOG_MAX_ENTRIES,
} from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Module-level singletons (survive within one SW lifetime)
// ---------------------------------------------------------------------------

const scanQueue = new ScanQueue({ maxAge: 60_000 });
const resultCache = new ResultCache();
const tabMediaRegistry = new TabMediaRegistry();

// ---------------------------------------------------------------------------
// MV3 keepalive alarm
// ---------------------------------------------------------------------------

function ensureAlarms() {
  chrome.alarms.get(KEEPALIVE_ALARM, alarm => {
    if (!alarm) chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: KEEPALIVE_INTERVAL_MIN });
  });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === KEEPALIVE_ALARM) return; // no-op; waking the SW is sufficient
});

// ---------------------------------------------------------------------------
// Offscreen document lifecycle
// ---------------------------------------------------------------------------

// Serialises concurrent createDocument() calls so only one is in flight.
let _offscreenCreating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!_offscreenCreating) {
    _offscreenCreating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason[OFFSCREEN_REASON]],
      justification: 'C2PA WASM verification requires Web Worker support unavailable in service workers.',
    }).finally(() => { _offscreenCreating = null; });
  }
  await _offscreenCreating;
}

// ---------------------------------------------------------------------------
// Fetch utilities
// ---------------------------------------------------------------------------

export async function fetchAsBytes(url) {
  const fetchStart = performance.now();
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}) for ${url}`);

  let mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim() ?? '';
  if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
    if (/\.jpe?g(\?|$)/i.test(url)) mediaType = 'image/jpeg';
    else if (/\.png(\?|$)/i.test(url)) mediaType = 'image/png';
    else if (/\.gif(\?|$)/i.test(url)) mediaType = 'image/gif';
    else if (/\.webp(\?|$)/i.test(url)) mediaType = 'image/webp';
    else if (/\.mp4(\?|$)/i.test(url)) mediaType = 'video/mp4';
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`Asset too large (${buf.byteLength} bytes): ${url}`);
  }
  // performance.now() delta — single-context (service worker) measurement,
  // valid to subtract directly. Used by the Sprint 3 performance harness.
  const fetchMs = +(performance.now() - fetchStart).toFixed(2);
  return { mediaType, bytes: new Uint8Array(buf), fetchMs };
}

// ---------------------------------------------------------------------------
// Verification pipeline (cache → offscreen WASM → cache write)
// ---------------------------------------------------------------------------

async function verifyOne(url, bypassCache = false) {
  if (!bypassCache) {
    const cached = resultCache.get(url);
    if (cached) return { sourceUrl: url, ...cached, _cached: true };
  }

  scanQueue.markInFlight(url);
  const verifyStartedAt = Date.now();

  try {
    const { mediaType, bytes, fetchMs } = await fetchAsBytes(url);

    if (!SUPPORTED_MIME_TYPES.includes(mediaType)) {
      const record = { sourceUrl: url, status: VERIFY_STATUS.UNSUPPORTED_FORMAT, manifest: null, error: null };
      resultCache.set(url, { status: VERIFY_STATUS.UNSUPPORTED_FORMAT, manifest: null, error: null });
      scanQueue.markDone(url, record);
      return record;
    }

    await ensureOffscreen();

    // chrome.runtime.sendMessage uses JSON serialization — ArrayBuffer becomes
    // "[object ArrayBuffer]". Send as a plain number array; offscreen
    // reconstructs as Uint8Array before passing to c2pa-web.
    const messageStart = performance.now();
    const response = await chrome.runtime.sendMessage(
      msg(MSG.VERIFY_REQUEST, { bytes: Array.from(bytes), mimeType: mediaType })
    );
    // Single-context (service worker) measurement — includes the offscreen
    // document's own wasmVerifyMs (response.perf) plus message-passing
    // overhead, so (messageRoundTripMs - wasmVerifyMs) approximates that
    // overhead. Sprint 3 performance harness only; no behaviour change.
    const messageRoundTripMs = +(performance.now() - messageStart).toFixed(2);

    const record = {
      sourceUrl: url,
      status: response.status,
      manifest: response.manifest ?? null,
      error: response.error ?? null,
      perf: {
        byteLength: bytes.length,
        fetchMs,
        messageRoundTripMs,
        wasmVerifyMs: response.perf?.wasmVerifyMs ?? null,
        heapBeforeBytes: response.perf?.heapBefore?.usedJSHeapSize ?? null,
        heapAfterBytes:  response.perf?.heapAfter?.usedJSHeapSize ?? null,
        verifyStartedAt,
        resultAt: Date.now(),
      },
    };

    resultCache.set(url, { status: record.status, manifest: record.manifest, error: record.error });
    scanQueue.markDone(url, record);
    return record;

  } catch (err) {
    const record = {
      sourceUrl: url,
      status: 'error',
      manifest: null,
      error: { message: err.message ?? String(err) },
    };
    scanQueue.markFailed(url, err);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Bounded-concurrency runner
// ---------------------------------------------------------------------------

async function runConcurrent(tasks, limit) {
  if (tasks.length === 0) return [];
  const results = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

// ---------------------------------------------------------------------------
// Performance harness — Sprint 3
// ---------------------------------------------------------------------------
//
// One record per verified item, appended in a single batched read-modify-
// write per scan (not per item — SCAN_CONCURRENCY runs items concurrently,
// and per-item writes would race on chrome.storage.local's read-then-write).
// Capped at PERF_LOG_MAX_ENTRIES, oldest dropped first. Retrieve from the
// service worker's own DevTools console — see
// docs/phase2/performance-harness-evidence/README.md.
async function appendPerfEntries(entries) {
  if (!entries.length) return;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PERF_LOG);
  const log = stored[STORAGE_KEYS.PERF_LOG] ?? [];
  log.push(...entries);
  if (log.length > PERF_LOG_MAX_ENTRIES) log.splice(0, log.length - PERF_LOG_MAX_ENTRIES);
  await chrome.storage.local.set({ [STORAGE_KEYS.PERF_LOG]: log });
}

// ---------------------------------------------------------------------------
// Active-tab scan
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
  const total = mediaItems.length;
  let done = 0;

  const perfEntries = [];

  const tasks = mediaItems.map(item => async () => {
    const res = await verifyOne(item.src, true); // bypass cache on manual page scan
    done++;
    chrome.runtime.sendMessage(
      msg(MSG.SCAN_PROGRESS, { done, total })
    ).catch(() => { });

    if (res.perf) {
      const resultAt = res.perf.resultAt;
      perfEntries.push({
        url: item.src,
        kind: item.kind,
        status: res.status,
        byteLength: res.perf.byteLength,
        detectedAt: item.detectedAt ?? null,
        verifyStartedAt: res.perf.verifyStartedAt,
        resultAt,
        // detection -> result, cross-context so Date.now() (wall clock) not
        // performance.now() (per-context origin) — see content-script.js.
        totalLatencyMs: item.detectedAt != null ? resultAt - item.detectedAt : null,
        fetchMs: res.perf.fetchMs,
        messageRoundTripMs: res.perf.messageRoundTripMs,
        wasmVerifyMs: res.perf.wasmVerifyMs,
        heapBeforeBytes: res.perf.heapBeforeBytes,
        heapAfterBytes: res.perf.heapAfterBytes,
        heapDeltaBytes: (res.perf.heapBeforeBytes != null && res.perf.heapAfterBytes != null)
          ? res.perf.heapAfterBytes - res.perf.heapBeforeBytes
          : null,
      });
    }

    return { ...item, ...res, sourceUrl: res.sourceUrl ?? item.src };
  });

  const results = await runConcurrent(tasks, SCAN_CONCURRENCY);
  await appendPerfEntries(perfEntries);

  const summary = {
    pageUrl: response.pageUrl,
    scannedAt: Date.now(),
    count: results.length,
    results,
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN]: summary });
  return summary;
}

// ---------------------------------------------------------------------------
// Realtime tracking helpers
// ---------------------------------------------------------------------------

function broadcastMediaUpdate(tabId) {
  const media = tabMediaRegistry.getAll(tabId);
  const pageUrl = tabMediaRegistry.getPageUrl(tabId);
  chrome.runtime.sendMessage(msg(MSG.MEDIA_UPDATED, {
    tabId,
    media,
    pageUrl,
    count: media.length,
  })).catch(() => { });
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ensureAlarms();

  const senderTabId = sender?.tab?.id ?? null;

  (async () => {
    try {
      switch (message?.type) {

        // ── Realtime tracking ────────────────────────────────────────────── //

        case MSG.MEDIA_DETECTED: {
          const { media = [], pageUrl = '' } = message.payload ?? {};
          if (senderTabId !== null) {
            const { newItems } = tabMediaRegistry.update(senderTabId, pageUrl, media);
            if (newItems.length > 0) broadcastMediaUpdate(senderTabId);
          }
          sendResponse({ ok: true });
          return;
        }

        case MSG.GET_TAB_MEDIA: {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) { sendResponse({ ok: false, error: 'No active tab.' }); return; }
          sendResponse({
            ok: true,
            tabId: tab.id,
            media: tabMediaRegistry.getAll(tab.id),
            pageUrl: tabMediaRegistry.getPageUrl(tab.id),
            count: tabMediaRegistry.getCount(tab.id),
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

        // ── Cache / queue management (Sprint 4 prep) ─────────────────────── //

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
  if (changeInfo.status === 'loading') {
    tabMediaRegistry.clear(tabId);
    chrome.runtime.sendMessage(msg(MSG.MEDIA_UPDATED, {
      tabId, media: [], pageUrl: '', count: 0,
    })).catch(() => { });
  }
});

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
  // Warm the WASM runtime so the first scan doesn't pay the init cost.
  ensureOffscreen().catch(console.error);
  console.log('[C2PA background] extension installed / updated.');
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  ensureOffscreen().catch(console.error);
  console.log('[C2PA background] browser started.');
});

ensureAlarms();
console.log('[C2PA background] service worker started.');