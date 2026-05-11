// src/shared/ipc-client.js
//
// Thin HTTP client for the local Rust verification service.
// All requests use the shared secret stored in chrome.storage.local.

import { API_PREFIX, STORAGE_KEYS } from './constants.js';

/**
 * Resolve the shared secret from extension storage.
 * @returns {Promise<string|null>}
 */
async function getSharedSecret() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SHARED_SECRET);
  return result[STORAGE_KEYS.SHARED_SECRET] ?? null;
}

/**
 * Make an authenticated POST to the Rust service.
 * @param {string} path   e.g. "/verify"
 * @param {object} body
 */
async function authedPost(path, body) {
  const secret = await getSharedSecret();
  if (!secret) {
    throw new Error(
      'Shared secret not configured. Open the extension popup → Settings → paste the secret printed by the Rust service.'
    );
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-C2PA-Token':   secret,
      'X-C2PA-Api-Version': '1',
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Service returned non-JSON (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }

  if (!response.ok) {
    const msg = parsed?.error?.message ?? response.statusText;
    const err = new Error(msg);
    err.code = parsed?.error?.code ?? 'UNKNOWN';
    err.status = response.status;
    throw err;
  }

  return parsed;
}

/**
 * GET /api/v1/health — liveness probe. No auth required by the service, but we still
 * hit it to verify the port is reachable.
 */
export async function checkHealth() {
  const response = await fetch(`${API_PREFIX}/health`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * POST /api/v1/verify — send an asset for verification.
 * @param {{ sourceUrl: string, mediaType: string, dataBase64: string }} asset
 */
export async function verifyAsset({ sourceUrl, mediaType, dataBase64 }) {
  return authedPost('/verify', {
    source_url:  sourceUrl,
    media_type:  mediaType,
    data_base64: dataBase64,
  });
}
