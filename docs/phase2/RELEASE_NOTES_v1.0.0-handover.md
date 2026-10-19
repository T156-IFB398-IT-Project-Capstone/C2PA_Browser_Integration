# v1.0.0-handover — C2PA Content Credentials browser extension

The final Phase 2 handover release of the C2PA Content Credentials browser
extension, from QUT IT Capstone Team T156 (project P917). The extension detects
images and MP4 video on web pages, verifies their embedded C2PA Content
Credentials locally with WebAssembly, and shows the result with quiet, neutral
indicators. It is a Chromium extension, and it is structured so the verification
core can be lifted into a built-in browser setting.

- **Version:** 1.0.0 (`package.json`, `extension/manifest.json`)
- **Engine:** `@contentauth/c2pa-web` **0.13.1**, pinned exactly
- **Previous release:** `v0.2.0-handover` (7 Sep 2026)

## What is included

| Deliverable | Where |
|---|---|
| Browser extension | `extension/` (source in `extension/src/`, built into `extension/dist/`) |
| Trust and verification layer | `extension/src/offscreen/offscreen.js`. Bundled official C2PA trust lists in `trust-lists/c2pa-conformance/`. Decisions in `docs/phase2/decisions/`. |
| Test bench (source) | `c2pa-test-bench/`. It runs the extension's real verifier. Hosted copy: c2patest.pages.dev; redeploying it from this tag is a separate step. |
| Engine-level check and evidence | `tests/engine/` (harness) and `docs/phase2/engine-check/` (before/after runs) |
| Unit tests and CI | `tests/unit/` (`npm test`), and `.github/workflows/ci.yml` ("Build and static checks" on every PR) |
| Performance results | `perf/results/2026-10-07/` (method, raw logs, `results.json`). `perf/analyze.mjs` regenerates every figure. |
| Handover documentation in this repository | `README.md`, `KNOWN_LIMITATIONS.md`, `docs/phase2/` (decisions, engine-check evidence, supported-formats matrix, SPIKE-001, finding-001, UI test checklist, trust-list notes) |

The conversion guide, seam documentation, engine version record and user guide
are being finalised separately. They are **not part of this tag**.

## Changes since v0.2.0-handover

| Change | PR |
|---|---|
| MP4 badge parity (corner badge, tooltip and "More detail" on video) | #23 |
| Badge outline, plain-language wording, popup ON/OFF switch, layout-shift fix | #24, #25, #26 |
| Trust-list handover notes (corrected in #33) | #27 |
| Performance results for the 7 Oct run, plus the merged-branches record | #28 |
| Release hygiene: exact `c2pa-web` pin, stale `extension.crx` removed, version 1.0.0 | #29 |
| Engine-level check harness and "before" results | #30 |
| **QA fix 1:** official C2PA trust lists bundled as trust anchors; no silent engine fallback | #31 |
| **QA fix 2:** no network during verification; new neutral state "Credentials stored online — not checked" | #32 |
| Docs corrections: trust-list notes, `KNOWN_LIMITATIONS.md`, README | #33 |

## QA fixes from the 12 October final QA

| Fix | Status in this release | Evidence |
|---|---|---|
| 1 — Trust anchors for C2PA signers | **Included** (PR #31), with a stated deviation: the list ships with each release; it is not live validation | `docs/phase2/engine-check/after-trust-anchors/` and `docs/phase2/decisions/2026-10-19-trust-anchors.md` |
| 2 — Remote manifests | **Included** (PR #32). Remote manifests are not fetched. The CAWG identity DID lookup is also turned off. | `docs/phase2/engine-check/after-remote-manifests/` and `docs/phase2/decisions/2026-10-19-no-network-verification.md` |
| 3 — Popup, test bench and in-page badges agree; "Timestamp: Trusted" label | **Not included.** Not on `main` when this release was prepared. | `KNOWN_LIMITATIONS.md` L12 |
| 4 — Test-bench fixture labels and scenario matrix | **Not included.** Not on `main` when this release was prepared. | `KNOWN_LIMITATIONS.md` L12 |

## What the engine does with this release

The engine-level check (`node tests/engine/run.mjs`) runs the real verifier in
headless Chrome 155. The run `docs/phase2/engine-check/after-remote-manifests/`
used the engine settings of this release:

| Sample | Result |
|---|---|
| `car.jpg` | Verified via TSA |
| `ChatGPTgen.png` | Invalid or changed (signing certificate expired, no timestamp) |
| `crater-lake.jpg` | Credentials stored online — not checked |
| `cloudscape.jpeg` | Invalid or changed (expired certificate; timestamp authority not trusted) |
| `sora.MP4` | Invalid or changed (expired certificate; timestamp authority not trusted) |

**No network request was made during verification.** A capture self-test in the
same run confirms that requests from the engine's Web Worker are recorded.

None of the samples is signed under a CA on the official C2PA Trust List, so none
reads "Verified — trusted". A test-only control shows that a listed signer does.

## Known limitations

See [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md). In short:

- The trust list ships with each release; it is not real-time. There is no
  revocation (OCSP/CRL) checking.
- Credentials stored online and CAWG identity assertions are not checked.
- Expired certificates without a trusted timestamp read "Invalid or changed"
  (finding-001, a policy decision for Databench).
- Remuxing drops the C2PA box (reported by the final QA; evidence not yet in the
  repository).
- Streamed (MSE) video cannot be verified, and assets over 15 MB are not verified.
- Host-page CSS can shift badged images in two known cases.
- QA fixes 3 and 4 are not included.
- `reader.free()` is not called, and WASM memory is not measured.
- The unit tests use an SDK stand-in. The engine-level check covers engine
  behaviour.
- CI is not a required check.
- **MaxBrowser has not been tested**; only Chrome has been verified.

## Install from this release

Requirements: Node.js 20 or later (22 or later for the engine-level check), and
Google Chrome or another Chromium browser.

```bash
git clone --branch v1.0.0-handover https://github.com/T156-IFB398-IT-Project-Capstone/C2PA_Browser_Integration.git
cd C2PA_Browser_Integration
npm ci            # installs c2pa-web 0.13.1 exactly; builds the test-bench bundle
npm run build     # builds extension/dist/
npm test          # unit tests
```

Instead of cloning, you can download the source archive attached to this release.

Then, in Chrome:

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Pin the extension and open a page with images. The popup has the ON/OFF switch.

To run the test bench locally: `npm run dev` (serves http://127.0.0.1:8976).

## Verification evidence

- **CI:** "Build and static checks" passed on every PR above.
- **Unit tests:** `npm test` gives 174 pass, 0 fail (on `main` after #33).
- **Engine-level check:** `docs/phase2/engine-check/`, with three runs (before, after
  trust anchors, after remote manifests off).
- **Performance:** `perf/results/2026-10-07/README.md` (n = 3 per scenario, Chrome
  154, run on `654a59d`).
- **Fresh-clone verification:** the tag is created only after the tagged commit,
  cloned into an empty directory, passes `npm ci`, `npm run build`,
  `node scripts/check-syntax.mjs`, `npm test` and the engine-level check. It must
  also pass the manual browser checks: load unpacked in a clean Chrome profile,
  ON/OFF, badges on the gallery page, an MP4 and a no-credentials image. The
  outputs are recorded in the GenAI log after tagging.
