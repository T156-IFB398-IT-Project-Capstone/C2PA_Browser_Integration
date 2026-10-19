# Known limitations — v1.0.0 handover

Refreshed 19 October 2026 for the `v1.0.0-handover` release (this replaces the
August 2026 version, which is in git history). Every item names its evidence;
"not evidenced" means the repository holds no proof either way.

Engine: `@contentauth/c2pa-web` **0.13.1**, pinned exactly (`package.json`).

## Trust and verification

### L1 — Trust list shipped per release, not real-time

The extension bundles the official **C2PA Trust List** and **C2PA TSA Trust List**
(C2PA Conformance Program, `c2pa-org/conformance-public` commit `47009ee`, retrieved
19 Oct 2026). They live in `trust-lists/c2pa-conformance/` and are passed to the
engine as one PEM string. The list is as current as the release that ships it. It is
**not** live, real-time trust-list validation, and nothing is fetched at
verification time. To update it, follow the procedure in
`trust-lists/c2pa-conformance/README.md`.
Decision: `docs/phase2/decisions/2026-10-19-trust-anchors.md`.

- **No revocation checking** (OCSP/CRL). A revoked certificate is not detected.
- **Current samples stay untrusted.** The Adobe and OpenAI test assets are signed
  under CAs that are not on the official list, so they read "Unverified" or
  "Verified via TSA", never "Verified — trusted". The engine-level check proves that
  a listed signer does reach `verified_trusted` (test-only control in
  `docs/phase2/engine-check/after-trust-anchors/`). However, no sample in the
  corpus is signed under a listed CA, so the in-page "Verified", "Verified · Edited"
  and "AI-Edited" badges are **not evidenced** on real content.
- **TSA trust not evidenced.** c2pa-web 0.13.1 has no separate TSA trust setting,
  so both lists are given to the engine in one anchor set. No sample's timestamp
  comes from a listed TSA.

### L2 — Credentials stored online are not checked

Verification makes **no network request**. Evidence:
`docs/phase2/engine-check/after-remote-manifests/`, where all checks PASS,
including a capture self-test.
Decision: `docs/phase2/decisions/2026-10-19-no-network-verification.md`.

- An asset that only links to a remote manifest (e.g. `crater-lake.jpg`) shows
  **"Credentials stored online — not checked"** (`remote_not_checked`). Its
  credentials are not fetched and not verified.
- **CAWG identity assertions are not validated**
  (`core.decodeIdentityAssertions: false`), because their DID lookup goes online.
  The extension never displayed CAWG identity results.

### L3 — Expired signing certificates (finding-001)

The engine checks certificate validity against the current time. A certificate
that has expired without a *trusted* timestamp therefore reads "Invalid or changed".
The samples' timestamps come from authorities the engine does not trust
(`timeStamp.untrusted` on `cloudscape.jpeg` and `sora.MP4`), so they are not
rescued. `ChatGPTgen.png` has no timestamp and reads "Invalid or changed"
(`docs/phase2/engine-check/`). How to treat archival content is a policy decision
for Databench, open since finding-001 (`docs/phase2/finding-001-expired-signing-certificate.md`).

### L4 — Absence of credentials is not evidence of anything

Most web media has its metadata stripped. Stripped credentials cannot be told
apart from media that was never signed: both read "No Content Credentials", and
the popup says this does not mean the media is fake.

### L5 — Hard binding only

Manifests must be embedded in the file. Soft binding, which recovers credentials
through perceptual features, is not implemented. Hard binding does not survive
screenshots, resizing or re-encoding.

### L6 — Remuxing drops the C2PA box

The 12 Oct final QA reported that a stream-copy remux (`ffmpeg -c copy`) of
`sora.MP4` drops the C2PA box, so the remuxed file reads "No Content Credentials".
That was an engine-level check. **Evidence is not yet in the repository**
(SPIKE-001 Q3 is recorded as blocked in `docs/phase2/spike-001-mp4-verification.md`).
Reproduction in the extension, with commands and hashes, is outstanding.

## Media and formats

### L7 — Formats

JPEG, PNG, GIF, WebP and MP4 are verified (`SUPPORTED_MIME_TYPES` in
`extension/src/shared/constants.js`; `docs/phase2/supported-formats-matrix.md`).
Audio is detected but not verified.

### L8 — Streamed (MSE) video is not verifiable

`blob:` and `data:` sources have no fetchable URL, so they are excluded by design
(`isVerifiableUrl()` in the content script).

### L9 — Asset size cap

Assets over **15 MB** are not verified (`MAX_ASSET_BYTES`), to limit WASM memory
pressure in the offscreen document.

## User interface

### L10 — Host-page CSS can still shift badged images

Two layout cases are known and out of scope: an image styled by a parent
selector such as `.gallery > img`, and `!important` sizing. In both, the host
page's CSS still moves the image when the badge wrapper is added
(`docs/genai-log/2026-10.md`, 9 Oct layout-fix entry). Switching the extension
OFF restores the original layout.

### L11 — Wording not user-tested

The usability round (six participants; findings in the feasibility report D5 §5,
implemented in PR #26) tested the AI-Edited, AI-Generated, Verified and No Content
Credentials wording. Neither the neutral "Unverified" badge nor the new
"Credentials stored online — not checked" wording has been user-tested.

### L12 — QA fixes 3 and 4 not on `main` (as of 19 Oct 2026)

These fixes are owned by teammates and were not on GitHub at the time of writing
(`git log origin/main`):

- The popup Shield and test bench (`badge-map.js`) use a different badge rule
  from the in-page badge.
- The detail view labels any validated timestamp "Timestamp: Trusted".
- Several test-bench fixtures are mislabelled (`expired-cert.jpg`,
  `verified-trusted.jpg`, `invalid-generic.jpg`).

## Engineering and process

### L13 — `reader.free()` is not called

The offscreen verifier does not free c2pa-web reader objects after
`manifestStore()`. Possible WASM memory growth cannot be observed, because
`performance.memory` excludes WASM linear memory (see the 7 Oct performance run,
`perf/results/2026-10-07/README.md`). Recommendation: call `reader.free()` in the
built-in feature and measure WASM memory there.

### L14 — Unit tests use an SDK stand-in

`npm test` replaces c2pa-web with `tests/unit/helpers/fake-c2pa-web.mjs`. It checks
what the engine is *given*, not what the engine *does*. Engine behaviour is shown
only by the engine-level check (`node tests/engine/run.mjs`, see
`tests/engine/README.md`). Re-run it after any engine, settings or trust-list
change.

### L15 — CI is not a required check

CI ("Build and static checks") runs on every PR. However, the repository's only
active ruleset blocks deletion and force-push on `main`, and does not require a
status check or review (`docs/phase2/branch-cleanup-report.md` §9).
Recommendation: require the check on `main`.

### L16 — Browser coverage

Verified on Chrome (Chromium) only: Chrome 154 for the 7 Oct performance run,
Chrome 155 for the 19 Oct engine-level check. **MaxBrowser has not been tested.**
