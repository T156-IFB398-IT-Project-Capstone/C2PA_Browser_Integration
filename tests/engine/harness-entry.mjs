// tests/engine/harness-entry.mjs
//
// Page side of the engine-level check. Bundled by tests/engine/run.mjs and
// loaded by harness.html. It imports the REAL, unmodified verifier from
// extension/src/offscreen/offscreen.js — the same verifyDetailed() that the
// extension's verify() calls — so the result is what the engine (c2pa-web,
// with the extension's own ENGINE_SETTINGS) actually does in Chrome. The unit
// suite cannot show this: it replaces c2pa-web with a stand-in.
//
// run.mjs calls the functions on window.__engineCheck one phase at a time and
// records every network request made while each phase runs.

import { createC2pa } from '@contentauth/c2pa-web/inline';
import {
  verifyDetailed,
  engineInitStatus,
  determineStatus,
  ENGINE_SETTINGS,
} from '../../extension/src/offscreen/offscreen.js';
import { VERIFY_STATUS } from '../../extension/src/shared/constants.js';

// Reserved TLD (RFC 2606): the request cannot reach a real server.
const CAPTURE_SELF_TEST_HOST = 'engine-check-capture-selftest.invalid';

const loaded = new Map();

async function load(name, mimeType) {
  const res = await fetch(`/assets/${encodeURIComponent(name)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`asset ${name}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  loaded.set(name, { bytes, mimeType });
  return { name, mimeType, size: bytes.length };
}

async function verifyAsset(name) {
  const payload = loaded.get(name);
  if (!payload) throw new Error(`asset ${name} was not loaded first`);
  const start = performance.now();
  try {
    const r = await verifyDetailed(payload);
    return {
      status: r.status,
      error: r.error,
      manifest: r.manifest,
      raw: r.raw,
      durationMs: +(performance.now() - start).toFixed(1),
    };
  } catch (err) {
    // Same mapping as the extension's offscreen message listener.
    const message = err?.message ?? String(err);
    return {
      status: /UnsupportedType/i.test(message) ? VERIFY_STATUS.NO_CREDENTIALS : 'error',
      error: { message },
      manifest: null,
      raw: null,
      durationMs: +(performance.now() - start).toFixed(1),
    };
  }
}

// Proves the network capture sees requests made from a Web Worker (c2pa-web
// runs the engine in one). run.mjs fails the whole check if this request is
// not recorded, because "no requests recorded" would then prove nothing.
function captureSelfTest() {
  const source =
    `fetch('https://${CAPTURE_SELF_TEST_HOST}/', { cache: 'no-store' })` +
    `.then(r => postMessage('response ' + r.status), e => postMessage('failed: ' + e.message));`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  return new Promise((resolve) => {
    const worker = new Worker(url);
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ host: CAPTURE_SELF_TEST_HOST, outcome: 'timeout' });
    }, 15000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ host: CAPTURE_SELF_TEST_HOST, outcome: String(event.data) });
    };
  });
}

// TEST-ONLY trust-anchor control. A separate engine instance gets the
// production settings with ONE extra CA certificate appended to the end of the
// production anchor string — a certificate taken from the asset's own embedded
// chain. If the asset then reports signingCredential.trusted, the engine is
// really applying trust.trustAnchors and has parsed the whole production PEM
// string. Never used by the extension; nothing here is shipped.
async function controlVerify(name, extraCaPem) {
  const payload = loaded.get(name);
  if (!payload) throw new Error(`asset ${name} was not loaded first`);
  const settings = {
    ...ENGINE_SETTINGS,
    trust: {
      ...ENGINE_SETTINGS.trust,
      trustAnchors: `${ENGINE_SETTINGS.trust?.trustAnchors ?? ''}\n${extraCaPem.trim()}\n`,
    },
  };
  const sdk = await createC2pa({ settings });
  const reader = await sdk.reader.fromBlob(payload.mimeType, new Blob([payload.bytes], { type: payload.mimeType }));
  const store = reader ? await reader.manifestStore() : null;
  return {
    status: determineStatus(store),
    raw: store && {
      active_manifest: store.active_manifest ?? null,
      validation_state: store.validation_state ?? null,
      validation_status: store.validation_status ?? null,
      validation_results: store.validation_results ?? null,
    },
  };
}

window.__engineCheck = {
  settings: () => ENGINE_SETTINGS,
  initStatus: () => engineInitStatus(),
  captureSelfTest,
  load,
  verify: verifyAsset,
  controlVerify,
};
window.__engineCheckReady = true;
document.getElementById('status').textContent = 'Engine-check bundle loaded.';
