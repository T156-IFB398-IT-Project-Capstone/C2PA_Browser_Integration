// c2pa-test-bench/verify-entry.mjs
// Bundled by build.mjs into verify-bundle.js, loaded by index.html before
// app.js. Imports the REAL verifier straight from the extension — this is
// the concrete proof that the verification core is reachable and testable
// outside the extension (CLAUDE.md Hard Constraint #1), not a second
// implementation of it. Any future change to offscreen.js's verify() flows
// through here automatically.
//
// Relative imports below resolve against THIS file's own location, so
// offscreen.js's internal ../../../trusted-certs/... PEM imports keep
// resolving correctly regardless of this entry point living outside
// extension/ — no path changes needed inside offscreen.js.

import { verify } from '../extension/src/offscreen/offscreen.js';
import { SUPPORTED_MIME_TYPES } from '../extension/src/shared/constants.js';
import { BADGE_FILES, pickBadgeState } from '../extension/src/shared/badge-map.js';

window.C2PAVerify = verify;
window.SUPPORTED_MIME_TYPES = SUPPORTED_MIME_TYPES;
window.BADGE_FILES = BADGE_FILES;
window.pickBadgeState = pickBadgeState;
