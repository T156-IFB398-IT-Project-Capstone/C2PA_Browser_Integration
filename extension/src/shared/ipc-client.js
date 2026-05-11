// src/shared/ipc-client.js
//
// Authenticated HTTP client for the local Rust verification service.
//
// Sprint 3 additions over Sprint 2:
//   - AbortController-based request timeout (IPC_TIMEOUT_MS)
//   - Exponential-backoff retry (IPC_MAX_RETRIES)
//   - In-process circuit breaker: opens after 3 consecutive server-side or
//     network failures; re-probes after 15 s to avoid hammering a down service.

import {
  API_PREFIX,
  STORAGE_KEYS,
  IPC_TIMEOUT_MS,
  IPC_MAX_RETRIES,
  IPC_RETRY_BASE_MS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Circuit breaker
// State lives in module scope and survives within one service-worker lifetime.
// ---------------------------------------------------------------------------

const _cb = {
  failures:           0,
  openUntil:          0,     // epoch ms; 0 = closed
  FAILURE_THRESHOLD:  3,
  OPEN_DURATION_MS:   15_000,
};

function _circuitIsOpen() {
  if (!_cb.openUntil) return false;
  if (Date.now() < _cb.openUntil) return true;
  // Half-open: reset so one probe can get through
  _cb.openUntil = 0;
  return false;
}

function _recordSuccess() {
  _cb.failures  = 0;
  _cb.openUntil = 0;
}

function _recordFailure() {
  _cb.failures += 1;
  if (_cb.failures >= _cb.FAILURE_THRESHOLD) {
    _cb.openUntil = Date.now() + _cb.OPEN_DURATION_MS;
    console.warn(
      `[C2PA ipc] Circuit opened after ${_cb.failures} failures; ` +
      `cooling down for ${_cb.OPEN_DURATION_MS / 1000} s. ` +
      'Start the Rust service: cd rust-service && cargo run'
    );
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function _fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPC_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function _getSecret() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SHARED_SECRET);
  return result[STORAGE_KEYS.SHARED_SECRET] ?? null;
}

// ---------------------------------------------------------------------------
// Authenticated POST with retry + circuit breaker
// ---------------------------------------------------------------------------

async function _authedPost(path, body) {
  if (_circuitIsOpen()) {
    const err = new Error(
      'Rust service unreachable (circuit open). ' +
      'Start the backend: cd rust-service && cargo run'
    );
    err.code = 'CIRCUIT_OPEN';
    throw err;
  }

  const secret = await _getSecret();
  if (!secret) {
    const err = new Error(
      'Shared secret not set. Open the extension popup → Settings → ' +
      'paste the secret printed by `cargo run`.'
    );
    err.code = 'NO_SECRET';
    throw err;
  }

  let lastErr;

  for (let attempt = 0; attempt < IPC_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = IPC_RETRY_BASE_MS * Math.pow(2, attempt - 1); // 400 ms, 800 ms
      await _sleep(delay);
      console.debug(`[C2PA ipc] retry ${attempt}/${IPC_MAX_RETRIES - 1} after ${delay} ms`);
    }

    try {
      const response = await _fetchWithTimeout(`${API_PREFIX}${path}`, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-C2PA-Token':       secret,
          'X-C2PA-Api-Version': '1',
        },
        body: JSON.stringify(body),
      });

      const raw = await response.text();
      let parsed;
      try { parsed = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`Non-JSON response (HTTP ${response.status}): ${raw.slice(0, 200)}`); }

      if (!response.ok) {
        const msg = parsed?.error?.message ?? response.statusText;
        const err = new Error(msg);
        err.code   = parsed?.error?.code ?? 'UNKNOWN';
        err.status = response.status;
        if (response.status >= 500) _recordFailure();
        throw err;
      }

      _recordSuccess();
      return parsed;

    } catch (err) {
      // Non-retriable errors — surface immediately
      if (err.code === 'NO_SECRET' || err.code === 'CIRCUIT_OPEN') throw err;

      if (err.name === 'AbortError') {
        lastErr      = new Error(`Request timed out after ${IPC_TIMEOUT_MS} ms`);
        lastErr.code = 'TIMEOUT';
        _recordFailure();
      } else {
        lastErr = err;
        // Only count network-level errors toward the circuit breaker here;
        // HTTP 4xx are already counted above.
        if (!err.status) _recordFailure();
      }

      if (attempt === IPC_MAX_RETRIES - 1) break;
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/health — liveness probe, no auth required.
 * @returns {Promise<{ status: string, version: string }>}
 */
export async function checkHealth() {
  try {
    const response = await _fetchWithTimeout(`${API_PREFIX}/health`, { method: 'GET' });
    if (!response.ok) {
      _recordFailure();
      throw new Error(`Health check failed: HTTP ${response.status}`);
    }
    _recordSuccess();
    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      _recordFailure();
      throw new Error(`Health check timed out after ${IPC_TIMEOUT_MS} ms`);
    }
    throw err;
  }
}

/**
 * POST /api/v1/verify — send an asset for C2PA verification.
 * @param {{ sourceUrl: string, mediaType: string, dataBase64: string }} asset
 */
export async function verifyAsset({ sourceUrl, mediaType, dataBase64 }) {
  return _authedPost('/verify', {
    source_url:  sourceUrl,
    media_type:  mediaType,
    data_base64: dataBase64,
  });
}
