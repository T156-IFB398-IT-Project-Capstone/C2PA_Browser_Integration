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

  // TEMPORARY DEBUG — remove before Step 6
  console.log('[c2pa-debug] verify input:', {
    bytesType:     bytes?.constructor?.name,
    bytesLength:   Array.isArray(bytes) ? bytes.length : (bytes?.byteLength ?? '?'),
    u8Length:      u8.length,
    firstBytesHex: Array.from(u8.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '),
    mimeType,
  });

  const blob   = new Blob([u8], { type: mimeType });
  const reader = await c2pa.reader.fromBlob(mimeType, blob);

  console.log('[c2pa-debug] reader:', reader === null ? 'null (no manifest)' : 'present');

  if (!reader) {
    return { status: VERIFY_STATUS.NO_CREDENTIALS, manifest: null, error: null };
  }

  const store = await reader.manifestStore();
  console.log('[c2pa-debug] manifestStore output:', JSON.stringify(store, null, 2));
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

// Build the manifest summary that popup.js renderItem() reads.
//
// THREE FIELD GAPS exist between popup.js expectations and c2pa-web's real
// output shape. Documented fully in C2PA_API_NOTES.md. Step 6 will update
// popup.js to use the correct field paths; until then this function adapts
// the c2pa-web output to match what popup.js already expects.
function extractManifest(store) {
  const label = store.active_manifest;
  if (!label) return null;
  const m = store.manifests?.[label];
  if (!m) return null;

  // GAP 1 — popup.js reads `manifest.creator`.
  // c2pa-web has no `.creator` field; nearest equivalent is claim_generator_info[0].name
  // (the human-readable name of the tool that produced the manifest) or the raw
  // claim_generator string as a fallback.
  const creator = m.claim_generator_info?.[0]?.name ?? m.claim_generator ?? null;

  // GAP 2 — popup.js reads `manifest.ai_disclosure` (boolean).
  // c2pa-web has no `.ai_disclosure` field; detect AI by scanning assertion labels.
  // Common AI assertion labels: c2pa.ai.generative.training, c2pa.ai_generative.training.
  // Step 6 can refine this to also check stds.schema-org.CreativeWork digitalSourceType.
  const ai_disclosure = hasAiAssertion(m.assertions);

  // GAP 3 — popup.js reads `manifest.signer?.common_name`.
  // c2pa-web stores this under `signature_info.common_name`, not `signer.common_name`.
  // Wrapping here to match the shape popup.js already expects; Step 6 will align paths.
  const signer = m.signature_info?.common_name
    ? { common_name: m.signature_info.common_name }
    : null;

  return { creator, ai_disclosure, signer };
}

// Return true if any assertion label contains an AI-related keyword.
// C2PA AI assertion labels seen in real manifests:
//   c2pa.ai.generative.training
//   c2pa.ai_generative.training
//   stds.schema-org.CreativeWork (needs data.digitalSourceType inspection — Step 6)
function hasAiAssertion(assertions) {
  if (!Array.isArray(assertions)) return false;
  return assertions.some(a => typeof a.label === 'string' && /\bai\b/i.test(a.label));
}
