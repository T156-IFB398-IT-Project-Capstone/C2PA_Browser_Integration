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
  if (!_sdkPromise) {
    // Initialize without hardcoded PEMs. This relies on the SDK's built-in
    // cawgTrust setting, which validates against the official CAWG trust list 
    // dynamically and automatically.
    _sdkPromise = createC2pa({
      settings: {
        cawgTrust: {
          verifyTrustList: true
        }
      }
    }).catch(err => {
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

// JS-heap snapshot for the performance harness. Chrome-only and
// approximate — performance.memory does not include WASM linear memory,
// so this understates the true footprint of the c2pa-web engine itself
// (same caveat SPIKE-001 already documented). Never throws: absent on
// non-Chrome/other contexts, callers get null and treat it as "not sampled".
function heapSnapshot() {
  return performance.memory
    ? { usedJSHeapSize: performance.memory.usedJSHeapSize }
    : null;
}

export async function verify({ bytes, mimeType }) {
  const c2pa = await getSdk();

  // service-worker.js sends bytes as a plain number array (chrome.runtime
  // does not support ArrayBuffer transfer). Reconstruct as Uint8Array.
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  const blob = new Blob([u8], { type: mimeType });

  // Performance-harness instrumentation only — measures fromBlob() +
  // manifestStore(), matching SPIKE-001's "verify-only" definition
  // (excludes SDK cold-start and byte fetch, both measured separately by
  // the caller). Does not change verification behaviour.
  const heapBefore = heapSnapshot();
  const wasmStart   = performance.now();

  const reader = await c2pa.reader.fromBlob(mimeType, blob);

  if (!reader) {
    const wasmVerifyMs = +(performance.now() - wasmStart).toFixed(2);
    return {
      status: VERIFY_STATUS.NO_CREDENTIALS, manifest: null, error: null,
      perf: { wasmVerifyMs, heapBefore, heapAfter: heapSnapshot() },
    };
  }

  const store = await reader.manifestStore();
  const wasmVerifyMs = +(performance.now() - wasmStart).toFixed(2);
  const heapAfter = heapSnapshot();

  return {
    status:   determineStatus(store),
    manifest: extractManifest(store),
    error:    null,
    perf:     { wasmVerifyMs, heapBefore, heapAfter },
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
  const actions = collectActionsDeep(store, label);
  const contentCategory = classifyContentFromActions(actions);
  const contentHistory = describeActions(actions);
  const { ai_disclosure, ai_source_type, has_non_ai_edit } = analyzeActions(m.assertions);
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

  return { creator, ai_disclosure, contentCategory, contentHistory, signer, tsa_info, validity_window };
  return { creator, ai_disclosure, ai_source_type, has_non_ai_edit, signer, tsa_info, validity_window };
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

// Inspect c2pa.actions / c2pa.actions.v2 assertion data for IPTC
// digitalSourceType values (AI involvement) and non-AI edit action verbs.
// Real-world AI manifests (ChatGPT, Firefly, Sora) embed digitalSourceType in
// action objects, not in the assertion label — label-pattern matching misses
// them entirely.
//
// ai_source_type distinguishes fully-generated from AI-assisted-edit content
// (needed for the Shield AI-Generated vs AI-Edited badge distinction — a
// boolean alone can't tell them apart). has_non_ai_edit flags a declared,
// non-AI edit action (crop, color adjustment, etc.) for the
// Authentic-but-Edited badge. Both are additive to the existing ai_disclosure
// boolean, not a replacement — nothing that already reads ai_disclosure
// needs to change.
function analyzeActions(assertions) {
  const result = { ai_disclosure: false, ai_source_type: null, has_non_ai_edit: false };
  if (!Array.isArray(assertions)) return result;

  const AI_GENERATED_TYPES = ['trainedAlgorithmicMedia', 'algorithmicMedia'];
  const AI_COMPOSITE_TYPES = ['compositeWithTrainedAlgorithmicMedia'];
  const NON_EDIT_ACTIONS   = new Set(['c2pa.created', 'c2pa.opened']);

  for (const assertion of assertions) {
    if (!/^c2pa\.actions(\.v\d+)?$/.test(assertion?.label ?? '')) continue;
    const actions = assertion?.data?.actions;
    if (!Array.isArray(actions)) continue;

    for (const action of actions) {
      const dst = action?.digitalSourceType ?? '';
      if (AI_GENERATED_TYPES.some(t => dst.includes(t))) {
        result.ai_disclosure = true;
        result.ai_source_type = 'generated';
      } else if (AI_COMPOSITE_TYPES.some(t => dst.includes(t))) {
        result.ai_disclosure = true;
        if (result.ai_source_type !== 'generated') result.ai_source_type = 'composite';
      } else if (!NON_EDIT_ACTIONS.has(action?.action ?? '')) {
        result.has_non_ai_edit = true;
      }
    }
  }

  return result;
}

// ── Content provenance classification ────────────────────────────────────────
//
// A separate axis from VERIFY_STATUS / determineStatus() above. That function
// answers "can we trust this manifest's signature chain"; this one answers
// "what does the manifest's own action history say happened to the content."
// The two are orthogonal — a trusted signature says nothing about whether the
// signed content is AI-generated. See content-script.js pickBadge() for how
// the two axes combine (content-script.js allows ai_generated through at any
// trust tier down to content_tampered/broken_signature, but still gates
// authentic/edited/ai_edited behind VERIFY_STATUS.VERIFIED_TRUSTED).
//
// IPTC digitalSourceType vocabulary (cv.iptc.org/newscodes/digitalsourcetype):
//   trainedAlgorithmicMedia / algorithmicMedia          -> fully synthetic
//   compositeWithTrainedAlgorithmicMedia                -> AI used on real content
//   anything else (digitalCapture, negativeFilm, ...)   -> not AI-sourced
//
// A capture with only creation/capture actions is "authentic"; one with
// additional non-AI editing actions (crop, colour, filter, etc.) is "edited".
//
// IMPORTANT: a generative disclosure often lives on an INGREDIENT manifest,
// not the active one. E.g. re-saving/exporting a ChatGPT (GPT-4o) image adds
// a wrapper manifest whose only action is "c2pa.opened" — the actual
// "c2pa.created" + digitalSourceType assertion sits on the ingredient it
// opened. collectActionsDeep() walks that chain so this doesn't get missed;
// confirmed against dev-test-library/adobe-official-manifests/ChatGPTgen.png.

const AI_GENERATED_SOURCE_TYPES = ['trainedAlgorithmicMedia', 'algorithmicMedia'];
const AI_EDITED_SOURCE_TYPES    = ['compositeWithTrainedAlgorithmicMedia'];

// Actions that represent creation/capture/handling, not an edit of existing content.
const NON_EDIT_ACTIONS = new Set(['c2pa.created', 'c2pa.opened', 'c2pa.published']);

function collectActions(assertions) {
  if (!Array.isArray(assertions)) return [];
  const actions = [];
  for (const assertion of assertions) {
    if (!/^c2pa\.actions(\.v\d+)?$/.test(assertion?.label ?? '')) continue;
    if (Array.isArray(assertion?.data?.actions)) actions.push(...assertion.data.actions);
  }
  return actions;
}

/** Collect actions from `manifestLabel` and every ingredient manifest beneath it. */
function collectActionsDeep(store, manifestLabel, seen = new Set()) {
  if (!manifestLabel || seen.has(manifestLabel)) return [];
  seen.add(manifestLabel);

  const manifest = store?.manifests?.[manifestLabel];
  if (!manifest) return [];

  const actions = collectActions(manifest.assertions);
  for (const ingredient of manifest.ingredients ?? []) {
    if (ingredient?.active_manifest) {
      actions.push(...collectActionsDeep(store, ingredient.active_manifest, seen));
    }
  }
  return actions;
}

/**
 * @param {object[]} actions  Pre-collected actions (see collectActionsDeep).
 * @returns {'authentic'|'edited'|'ai_edited'|'ai_generated'|null}
 */
export function classifyContentFromActions(actions) {
  if (!actions || actions.length === 0) return null;

  const sourceTypes = actions.map(a => a?.digitalSourceType ?? '');

  if (sourceTypes.some(dst => AI_GENERATED_SOURCE_TYPES.some(t => dst.includes(t)))) {
    return 'ai_generated';
  }
  if (sourceTypes.some(dst => AI_EDITED_SOURCE_TYPES.some(t => dst.includes(t)))) {
    return 'ai_edited';
  }

  const hasEditAction = actions.some(a => a?.action && !NON_EDIT_ACTIONS.has(a.action));
  return hasEditAction ? 'edited' : 'authentic';
}

/**
 * Classify content provenance into one of four buckets, or null if neither
 * `manifestLabel` nor any ingredient beneath it carries action history to
 * classify from.
 * @returns {'authentic'|'edited'|'ai_edited'|'ai_generated'|null}
 */
export function classifyContent(store, manifestLabel) {
  return classifyContentFromActions(collectActionsDeep(store, manifestLabel));
}

// Human-readable labels for common C2PA action codes, used for the
// "content history" fact shown in the detail popup. Falls back to a
// generic title-cased label (stripping the "c2pa." prefix) for any action
// code not listed here — the vocabulary is large and still growing.
const ACTION_LABELS = {
  'c2pa.created':            'Created',
  'c2pa.opened':             'Opened',
  'c2pa.converted':          'Converted',
  'c2pa.copied':             'Copied',
  'c2pa.cropped':            'Cropped',
  'c2pa.resized':            'Resized',
  'c2pa.filtered':           'Filtered',
  'c2pa.color_adjustments':  'Color adjusted',
  'c2pa.drawing':            'Drawing added',
  'c2pa.edited':             'Edited',
  'c2pa.orientation':        'Orientation changed',
  'c2pa.published':          'Published',
  'c2pa.repackaged':         'Repackaged',
};

function titleCase(s) {
  return s.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

function describeAction(action) {
  const code = action?.action ?? '';
  const base = ACTION_LABELS[code] ?? (code ? titleCase(code.replace(/^c2pa\./, '')) : 'Unknown action');

  const agent = typeof action.softwareAgent === 'string' ? action.softwareAgent : action.softwareAgent?.name;
  const dst = action?.digitalSourceType ?? '';
  const isAi = [...AI_GENERATED_SOURCE_TYPES, ...AI_EDITED_SOURCE_TYPES].some(t => dst.includes(t));

  let label = agent ? `${base} by ${agent}` : base;
  if (isAi) label += ' (AI)';
  return label;
}

/** @param {object[]} actions  Pre-collected actions (see collectActionsDeep). */
export function describeActions(actions) {
  return (actions ?? []).map(describeAction);
}
