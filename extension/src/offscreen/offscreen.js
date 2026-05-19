// extension/src/offscreen/offscreen.js
//
// C2PA verification via @contentauth/c2pa-web (inline WASM mode).
// Runs inside a Chrome Offscreen Document, which has full Web Worker + WASM
// support that the MV3 service worker lacks.
//
// Message protocol (request/response via chrome.runtime.onMessage):
//   IN  { type: MSG.VERIFY_REQUEST, payload: { bytes: number[], mimeType: string } }
//   OUT { status: string, manifest: object|null, error: { message: string }|null }

import { createC2pa }               from '@contentauth/c2pa-web/inline';
import { MSG }                       from '../shared/messages.js';
import { VERIFY_STATUS }             from '../shared/constants.js';

// ── SDK singleton ─────────────────────────────────────────────────────────────
// Defer initialisation to the first verification request so the offscreen
// document starts up fast. Reuse the same instance for all subsequent calls.
let _sdkPromise = null;

function getSdk() {
  if (!_sdkPromise) _sdkPromise = createC2pa();
  return _sdkPromise;
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG.VERIFY_REQUEST) return false;

  verify(message.payload)
    .then(sendResponse)
    .catch(err => {
      const msgText = err?.message ?? String(err);
      // c2pa-web throws UnsupportedType for assets it cannot parse (wrong
      // container, no C2PA box in some format variants). Surface as
      // NO_CREDENTIALS so the popup shows a sensible state rather than "Error".
      const status = /UnsupportedType/i.test(msgText)
        ? VERIFY_STATUS.NO_CREDENTIALS
        : 'error';
      sendResponse({ status, manifest: null, error: status === 'error' ? { message: msgText } : null });
    });

  return true; // keep the message channel open for the async sendResponse
});

// ── Core verification ─────────────────────────────────────────────────────────

async function verify({ bytes, mimeType }) {
  const c2pa = await getSdk();

  // service-worker.js sends bytes as a plain number array (chrome.runtime
  // does not support ArrayBuffer transfer). Reconstruct as Uint8Array.
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  const blob   = new Blob([u8], { type: mimeType });
  const reader = await c2pa.reader.fromBlob(mimeType, blob);

  if (!reader) {
    return { status: VERIFY_STATUS.NO_CREDENTIALS, manifest: null, error: null };
  }

  const store = await reader.manifestStore();
  await reader.free();

  return {
    status:   stateToStatus(store.validation_state),
    manifest: extractManifest(store),
    error:    null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Map c2pa-web ValidationState → VERIFY_STATUS string.
// c2pa-web states: "Trusted" | "Valid" | "Invalid"
//   Trusted — signature valid AND signer is in the trust list
//   Valid   — signature valid but signer not in trust list (self-signed etc.)
//   Invalid — signature broken or content tampered
function stateToStatus(state) {
  switch (state) {
    case 'Trusted': return VERIFY_STATUS.VERIFIED_TRUSTED;
    case 'Valid':   return VERIFY_STATUS.VERIFIED_UNTRUSTED;
    case 'Invalid': return VERIFY_STATUS.INVALID_OR_CHANGED;
    default:        return VERIFY_STATUS.INVALID_OR_CHANGED;
  }
}

function extractManifest(store) {
  const label = store.active_manifest;
  if (!label) return null;
  const m = store.manifests?.[label];
  if (!m) return null;

  const creator       = extractCreator(m);
  const ai_disclosure = hasAiAssertion(m.assertions);
  const signer        = m.signature_info?.common_name
    ? { common_name: m.signature_info.common_name }
    : null;

  return { creator, ai_disclosure, signer };
}

// Resolve the most meaningful creator string for the popup.
// Priority:
//   1. Human author from stds.schema-org.CreativeWork data.author[0].name
//   2. Tool name from claim_generator_info[0].name  (e.g. "Adobe Photoshop")
//   3. Raw claim_generator string (user-agent format)
// AI-generated content typically has no human author entry, so falls to (2).
function extractCreator(manifest) {
  const cw = Array.isArray(manifest.assertions)
    ? manifest.assertions.find(a => a?.label === 'stds.schema-org.CreativeWork')
    : null;
  const authorName = cw?.data?.author?.[0]?.name;
  if (typeof authorName === 'string' && authorName.length > 0) return authorName;

  return manifest.claim_generator_info?.[0]?.name
      ?? manifest.claim_generator
      ?? null;
}

// Detect AI-generated content by inspecting c2pa.actions / c2pa.actions.v2
// assertion data for IPTC digitalSourceType values.
// Real-world AI manifests (ChatGPT, Firefly, Sora) embed this in action objects,
// not in the assertion label — label-pattern matching misses them entirely.
function hasAiAssertion(assertions) {
  if (!Array.isArray(assertions)) return false;

  const AI_SOURCE_TYPES = [
    'trainedAlgorithmicMedia',
    'compositeWithTrainedAlgorithmicMedia',
    'algorithmicMedia',
  ];

  for (const assertion of assertions) {
    if (!/^c2pa\.actions(\.v\d+)?$/.test(assertion?.label ?? '')) continue;
    const actions = assertion?.data?.actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const dst = action?.digitalSourceType ?? '';
      if (AI_SOURCE_TYPES.some(t => dst.includes(t))) return true;
    }
  }

  return false;
}
