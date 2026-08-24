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
import c2paTrustPem                  from '../../../trusted-certs/C2PA-TRUST-LIST.pem';
import tsaTrustPem                   from '../../../trusted-certs/C2PA-TSA-TRUST-LIST.pem';

// Combined PEM trust anchors for C2PA CAs and TSAs.
const COMBINED_TRUST_PEM = [c2paTrustPem, tsaTrustPem].filter(Boolean).join('\n\n');

// ── SDK singleton ─────────────────────────────────────────────────────────────
// Defer initialisation to the first verification request so the offscreen
// document starts up fast. Reuse the same instance for all subsequent calls.
let _sdkPromise = null;

function getSdk() {
  if (!_sdkPromise) {
    _sdkPromise = createC2pa({
      settings: {
        trust: {
          trustAnchors: COMBINED_TRUST_PEM,
          userAnchors: COMBINED_TRUST_PEM,
        },
      },
    }).catch(err => {
      // Fallback without custom settings if settings configuration fails
      console.warn('[c2pa-offscreen] Failed init with trust settings, falling back to default:', err);
      return createC2pa();
    });
  }
  return _sdkPromise;
}

// ── Message listener ──────────────────────────────────────────────────────────

if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.VERIFY_REQUEST) return false;

    verify(message.payload)
      .then(sendResponse)
      .catch(err => {
        const msgText = err?.message ?? String(err);
        const status = /UnsupportedType/i.test(msgText)
          ? VERIFY_STATUS.NO_CREDENTIALS
          : 'error';
        sendResponse({ status, manifest: null, error: status === 'error' ? { message: msgText } : null });
      });

    return true; // keep the message channel open for the async sendResponse
  });
}

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

  return {
    status:   determineStatus(store),
    manifest: extractManifest(store),
    error:    null,
  };
}

// ── Helpers & Status Determination ───────────────────────────────────────────

/**
 * Determine exact verification status across the 7 scenarios:
 * 1. Verified (Trusted)   -> verified_trusted
 * 2. Verified via TSA    -> verified_tsa
 * 3. Untrusted Signer    -> verified_untrusted
 * 4. Expired (No TSA)     -> signing_expired
 * 5. Content Tampered     -> content_tampered
 * 6. Broken Signature     -> broken_signature
 * 7. No Credentials       -> no_credentials
 */
export function determineStatus(store) {
  if (!store || !store.active_manifest) {
    return VERIFY_STATUS.NO_CREDENTIALS;
  }

  const validationState = store.validation_state; // "Trusted" | "Valid" | "Invalid" | null
  const statusItems = Array.isArray(store.validation_status) ? store.validation_status : [];

  const activeRes = store.validation_results?.activeManifest || {};
  const failures = Array.isArray(activeRes.failure) ? activeRes.failure : [];
  const successes = Array.isArray(activeRes.success) ? activeRes.success : [];

  const allFailures = [...statusItems, ...failures];
  const allSuccesses = [...successes];

  const hasFailureCode = (pattern) => allFailures.some(f => 
    (f.code && pattern.test(f.code)) || (f.explanation && pattern.test(f.explanation))
  );

  const hasSuccessCode = (pattern) => allSuccesses.some(s => 
    (s.code && pattern.test(s.code)) || (s.explanation && pattern.test(s.explanation))
  );

  // 1. Content Tampered (pixel / data hash mismatch)
  const isTampered = hasFailureCode(/assertion\.(dataHash|hashedURI)\.mismatch|manifest\.check_sum|data hash invalid/i);
  if (validationState === 'Invalid' && isTampered) {
    return VERIFY_STATUS.CONTENT_TAMPERED;
  }

  // 2. Broken Signature (claim signature corrupt / mismatch)
  const isBrokenSig = hasFailureCode(/claimSignature\.(mismatch|corrupt|invalid)|claim\.signature/i);
  if (validationState === 'Invalid' && isBrokenSig) {
    return VERIFY_STATUS.BROKEN_SIGNATURE;
  }

  // Fallback for Invalid
  if (validationState === 'Invalid') {
    return VERIFY_STATUS.INVALID_OR_CHANGED;
  }

  // 3. TSA Timestamp Validity Window Checking
  const hasTsaValid = hasSuccessCode(/timeStamp\.(validated|trusted)/i) || 
                      hasSuccessCode(/timestamp message digest matched/i);
  const isCertExpired = hasFailureCode(/signingCredential\.(expired|outsideValidity)/i);

  // If cert is expired and NO valid TSA timestamp was present:
  if (isCertExpired && !hasTsaValid) {
    return VERIFY_STATUS.SIGNING_EXPIRED;
  }

  // If valid TSA timestamp is present (even if cert is untrusted/expired or inside validity window):
  if (hasTsaValid && (validationState === 'Valid' || isCertExpired)) {
    return VERIFY_STATUS.VERIFIED_TSA;
  }

  // 4. Trusted CA
  if (validationState === 'Trusted') {
    return VERIFY_STATUS.VERIFIED_TRUSTED;
  }

  // 5. Valid (Untrusted Signer)
  if (validationState === 'Valid') {
    return VERIFY_STATUS.VERIFIED_UNTRUSTED;
  }

  return VERIFY_STATUS.INVALID_OR_CHANGED;
}

function extractManifest(store) {
  const label = store.active_manifest;
  if (!label) return null;

  const m = store.manifests?.[label];
  if (!m) return null;

  const creator = extractCreator(m);
  const ai_disclosure = hasAiAssertion(m.assertions);
  const signer        = m.signature_info?.common_name
    ? {
        common_name: m.signature_info.common_name,
        issuer: m.signature_info.issuer ?? null,
        alg: m.signature_info.alg ?? null,
        time: m.signature_info.time ?? null,
      }
    : null;

  const activeRes = store.validation_results?.activeManifest || {};
  const successes = Array.isArray(activeRes.success) ? activeRes.success : [];
  const failures  = Array.isArray(activeRes.failure) ? activeRes.failure : [];

  const hasTsaValid = successes.some(s => /timeStamp\.(validated|trusted)/i.test(s.code ?? '') || /timestamp message digest matched/i.test(s.explanation ?? ''));
  const tsa_info = {
    validated: hasTsaValid,
    time: m.signature_info?.time ?? null,
  };

  const isCertExpired = failures.some(f => /signingCredential\.(expired|outsideValidity)/i.test(f.code ?? '') || /outside validity/i.test(f.explanation ?? ''));
  const validity_window = {
    inside_validity: successes.some(s => /claimSignature\.insideValidity/i.test(s.code ?? '')),
    expired: isCertExpired,
  };

  return { creator, ai_disclosure, signer, tsa_info, validity_window };
}

// Resolve creator string: author name > tool name > raw claim generator
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

function extractValidity(store, manifest) {
  const entries = [];

  // validation_status is the SDK's flat validation list
  if (Array.isArray(store.validation_status)) {
    entries.push(...store.validation_status);
  }

  // validation_results contains success/failure/informational groups
  const active = store.validation_results?.activeManifest;

  if (active) {
    if (Array.isArray(active.failure)) {
      entries.push(...active.failure);
    }

    if (Array.isArray(active.informational)) {
      entries.push(...active.informational);
    }

    if (Array.isArray(active.success)) {
      entries.push(...active.success);
    }
  }

  // Remove duplicates because the same validation issue may appear in
  // validation_status and validation_results.
  const unique = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry?.code) continue;

    const key = `${entry.code}|${entry.url ?? ''}|${entry.explanation ?? ''}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  }

  const hasCode = code =>
    unique.some(entry => entry.code === code);

  const hasCodeContaining = value =>
    unique.some(entry =>
      typeof entry.code === 'string' &&
      entry.code.toLowerCase().includes(value.toLowerCase())
    );

  const signingExpired =
    hasCode('signingCredential.expired');

  const signingUntrusted =
    hasCode('signingCredential.untrusted');

  const timestampUntrusted =
    hasCode('timeStamp.untrusted') ||
    hasCodeContaining('timestamp.untrusted');

  const timestampPresent =
    unique.some(entry =>
      typeof entry.code === 'string' &&
      entry.code.toLowerCase().includes('timestamp')
    );

  let certificateStatus = 'valid';

  if (signingExpired) {
    certificateStatus = 'expired';
  } else if (signingUntrusted) {
    certificateStatus = 'untrusted';
  } else if (
    store.validation_state !== 'Trusted' &&
    store.validation_state !== 'Valid'
  ) {
    certificateStatus = 'unknown';
  }

  let timestampStatus = 'none';

  if (timestampUntrusted) {
    timestampStatus = 'untrusted';
  } else if (timestampPresent) {
    timestampStatus = 'present';
  }

  return {
    certificate_status: certificateStatus,
    timestamp_status: timestampStatus,
    signing_time: manifest.signature_info?.time ?? null,
    issues: unique
      .filter(entry =>
        entry.code?.startsWith('signingCredential.') ||
        entry.code?.toLowerCase().includes('timestamp')
      )
      .map(entry => ({
        code: entry.code,
        explanation: entry.explanation ?? null,
      })),
  };
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
