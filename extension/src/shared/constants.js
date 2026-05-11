// src/shared/constants.js
//
// Central source of truth for all tunable values.
// Organised into sections so future sprints can find and extend them easily.

// --- Service endpoint --------------------------------------------------------

export const SERVICE_BASE_URL = 'http://127.0.0.1:8901';
export const API_VERSION      = 'v1';
export const API_PREFIX       = `${SERVICE_BASE_URL}/api/${API_VERSION}`;

// --- IPC reliability (Sprint 3) ---------------------------------------------
// These guard every fetch call to the Rust service.

export const IPC_TIMEOUT_MS    = 10_000;  // abort if the Rust service stalls
export const IPC_MAX_RETRIES   = 3;       // total attempts (first + 2 retries)
export const IPC_RETRY_BASE_MS = 400;     // exponential-backoff seed (400 → 800ms)

// --- MV3 keepalive & health monitoring (Sprint 3) ---------------------------
// Service workers may be terminated after ~30 s of inactivity.
// A keepalive alarm fires every 24 s to prevent that.
// A separate health alarm polls the Rust service every 30 s.

export const KEEPALIVE_ALARM          = 'c2pa.keepalive';
export const HEALTH_POLL_ALARM        = 'c2pa.health_poll';
export const KEEPALIVE_INTERVAL_MIN   = 0.4;   // 24 s  (< 30 s idle-kill threshold)
export const HEALTH_POLL_INTERVAL_MIN = 0.5;   // 30 s

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
]);

// Extensions used by the content script (no ES-module imports there).
// Keep in sync with SUPPORTED_MIME_TYPES above.
export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
]);

export const MEDIA_KIND = Object.freeze({
  IMAGE:        'image',
  GIF:          'gif',
  VIDEO_POSTER: 'video-poster',
  AUDIO:        'audio',
});

// --- Storage keys ------------------------------------------------------------

export const STORAGE_KEYS = Object.freeze({
  SHARED_SECRET: 'c2pa.shared_secret',
  LAST_SCAN:     'c2pa.last_scan',
  SETTINGS:      'c2pa.settings',
  HEALTH_STATE:  'c2pa.health_state',   // written to session storage
  SCAN_CACHE:    'c2pa.scan_cache',     // Sprint 4 prep
});

// --- Verification status (must match Rust API contract exactly) -------------

export const VERIFY_STATUS = Object.freeze({
  VERIFIED_TRUSTED:    'verified_trusted',
  VERIFIED_UNTRUSTED:  'verified_untrusted',
  INVALID_OR_CHANGED:  'invalid_or_changed',
  NO_CREDENTIALS:      'no_credentials',
  UNSUPPORTED_FORMAT:  'unsupported_format',
});

// Maximum asset size forwarded to the service (matches Rust-side cap).
export const MAX_ASSET_BYTES = 50 * 1024 * 1024; // 50 MB
