// src/shared/constants.js
//
// Central source of truth for all tunable values.
// Organised into sections so future sprints can find and extend them easily.

// --- Offscreen document (Step 2+) -------------------------------------------
// Used by service-worker.js to create/target the offscreen document.

export const OFFSCREEN_URL    = 'src/offscreen/offscreen.html';
export const OFFSCREEN_REASON = 'WORKERS';  // resolved to chrome.offscreen.Reason.WORKERS in SW

// --- MV3 keepalive -----------------------------------------------------------
// Service workers may be terminated after ~30 s of inactivity.
// A keepalive alarm fires every 24 s to prevent that.

export const KEEPALIVE_ALARM        = 'c2pa.keepalive';
export const KEEPALIVE_INTERVAL_MIN = 0.4;   // 24 s  (< 30 s idle-kill threshold)

// --- Scan pipeline (Sprint 3) ------------------------------------------------

export const SCAN_CONCURRENCY  = 3;        // max parallel verifications per scan
export const SCAN_DEDUP_TTL_MS = 60_000;   // reuse queue entry for 60 s

// --- Result cache (Sprint 4 prep) -------------------------------------------

export const CACHE_TTL_MS      = 5 * 60_000;  // 5-minute freshness window
export const CACHE_MAX_ENTRIES = 200;          // evict oldest 10% when full

// --- Supported media --------------------------------------------------------

export const SUPPORTED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
]);

// Extensions used by the content script (no ES-module imports there).
// Keep in sync with SUPPORTED_MIME_TYPES above.
export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4',
]);

export const MEDIA_KIND = Object.freeze({
  IMAGE:        'image',
  GIF:          'gif',
  VIDEO_POSTER: 'video-poster',
  AUDIO:        'audio',
});

// --- Storage keys ------------------------------------------------------------

export const STORAGE_KEYS = Object.freeze({
  LAST_SCAN:        'c2pa.last_scan',
  SETTINGS:         'c2pa.settings',
  SCAN_CACHE:       'c2pa.scan_cache',        // Sprint 4 prep
  PERF_LOG:         'c2pa.perf_log',          // Sprint 3 performance harness
  TEST_BENCH_LINK:  'c2pa.test_bench_link',   // 'local' | 'public' — popup's default left-click target
});

export const TEST_BENCH_URLS = Object.freeze({
  local:  'http://127.0.0.1:8976',
  public: 'https://c2patest.pages.dev',
});

// Cap on retained performance-harness records — bounds chrome.storage.local
// usage across repeated scans; oldest entries are dropped first.
export const PERF_LOG_MAX_ENTRIES = 1000;

// --- Verification status -----------------------------------------------------

export const VERIFY_STATUS = Object.freeze({
  VERIFIED_TRUSTED:   'verified_trusted',
  VERIFIED_TSA:       'verified_tsa',
  VERIFIED_UNTRUSTED: 'verified_untrusted',
  SIGNING_EXPIRED:    'signing_expired',
  CONTENT_TAMPERED:   'content_tampered',
  BROKEN_SIGNATURE:   'broken_signature',
  INVALID_OR_CHANGED: 'invalid_or_changed',
  NO_CREDENTIALS:     'no_credentials',
  UNSUPPORTED_FORMAT: 'unsupported_format',
});

// Maximum asset size forwarded to the offscreen verifier.
// Capped at 15 MB (down from 50 MB) to reduce WASM memory pressure in the
// offscreen document — see Migration Plan Trade-off T1.
export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
