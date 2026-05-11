// src/shared/constants.js
//
// Shared constants for the C2PA browser extension.
// Keep everything environment-dependent here so there's one place to change.

export const SERVICE_BASE_URL = 'http://127.0.0.1:8901';
export const API_VERSION = 'v1';
export const API_PREFIX = `${SERVICE_BASE_URL}/api/${API_VERSION}`;

// Supported MIME types for Sprint 2 vertical slice.
// Expand as c2pa-rs adoption lands.
export const SUPPORTED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
]);

// Keys used in chrome.storage.local.
export const STORAGE_KEYS = Object.freeze({
  SHARED_SECRET: 'c2pa.shared_secret',
  LAST_SCAN:     'c2pa.last_scan',
  SETTINGS:      'c2pa.settings',
});

// Verification status values. Must match the Rust service API contract exactly.
export const VERIFY_STATUS = Object.freeze({
  VERIFIED_TRUSTED:    'verified_trusted',
  VERIFIED_UNTRUSTED:  'verified_untrusted',
  INVALID_OR_CHANGED:  'invalid_or_changed',
  NO_CREDENTIALS:      'no_credentials',
  UNSUPPORTED_FORMAT:  'unsupported_format',
});

// Maximum asset size the extension will forward to the service (matches Rust-side cap).
export const MAX_ASSET_BYTES = 50 * 1024 * 1024; // 50 MB
