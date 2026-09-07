// src/shared/badge-map.js
//
// Shield badge — VERIFY_STATUS + manifest -> one of 4 states, or none.
// Pure, DOM-free — shared by extension/src/popup/popup.js and the C2PA
// test bench (via verify-entry.mjs), so the two can't drift apart on what
// counts as "authentic" versus what stays a plain status label.
//
// Only statuses where the hash binding and signature are cryptographically
// intact are badge-eligible. CONTENT_TAMPERED, BROKEN_SIGNATURE,
// INVALID_OR_CHANGED, NO_CREDENTIALS, UNSUPPORTED_FORMAT, and 'error' get no
// badge — the existing text status label already covers them honestly.
// Forcing one of these four "authentic" states onto a failed/absent case
// would be exactly the traffic-light overclaim CLAUDE.md's Hard Constraint
// #4 rules out. Applies identically to image and video results — the
// distinction is media-kind-independent.

import { VERIFY_STATUS } from './constants.js';

export const BADGE_ELIGIBLE_STATUSES = new Set([
  VERIFY_STATUS.VERIFIED_TRUSTED,
  VERIFY_STATUS.VERIFIED_TSA,
  VERIFY_STATUS.VERIFIED_UNTRUSTED,
  VERIFY_STATUS.SIGNING_EXPIRED,
]);

// Filenames only, deliberately no path prefix — consumers sit at different
// directory depths relative to the badge SVGs (popup.js: badges/..., the
// test bench: ../extension/src/popup/badges/...) and prepend their own base.
export const BADGE_FILES = {
  authentic:        { file: 'shield-authentic.svg',    alt: 'Authentic' },
  authentic_edited: { file: 'shield-edited-2.svg',      alt: 'Authentic — Edited' },
  ai_edited:        { file: 'shield-ai-edited.svg',     alt: 'AI-Edited' },
  ai_generated:     { file: 'shield-ai-generated.svg',  alt: 'AI-Generated' },
};

export function pickBadgeState(item) {
  if (!BADGE_ELIGIBLE_STATUSES.has(item.status)) return null;
  const m = item.manifest;
  if (!m) return null;
  if (m.ai_source_type === 'generated') return 'ai_generated';
  if (m.ai_source_type === 'composite') return 'ai_edited';
  if (m.has_non_ai_edit) return 'authentic_edited';
  return 'authentic';
}
