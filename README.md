# C2PA Content Credentials Browser Extension (QUT × Databench)

> IFB398 IT Capstone — Semester 1, 2026

A Chromium browser extension that detects images and video (MP4) on web pages, reads embedded C2PA Content Credentials manifests, and cryptographically verifies them using WebAssembly. Built for Databench Pty Ltd targeting MaxBrowser (Chromium/Brave-based). All verification runs locally — no external service, no server, no setup beyond loading the extension.

## Status

Phase 1 (Semester 1) proof-of-concept complete. Extension-only architecture validated end-to-end with real C2PA verification via WebAssembly, for images.

Phase 2 (Semester 2): SPIKE-001 confirmed `c2pa-web` parses and validates MP4's BMFF hard binding against a real signed asset (Outcome A — see `docs/phase2/spike-001-mp4-verification.md`), and the scan pipeline (content-script discovery → service worker → offscreen WASM verifier) now handles video the same way it handles images. Known follow-ups tracked in `docs/phase2/`: remux survival is still untested (Q3, blocked on a fixture), and a signing-certificate-expiry effect (`finding-001`) means a legitimately-signed asset can read as invalid once its signer's certificate lapses — independent of video, applies to any format.

## Getting started

No `.env`, no API keys, no external service, no separate server checkout.

```bash
git clone <repo-url>
cd C2PA_Browser_Integration

npm install     # 1. deps, then builds the test-bench bundle (postinstall)
npm run build   # 2. builds extension/dist/ — required before Load unpacked
npm run dev     # 3. watcher + test bench on http://127.0.0.1:8976
```

Requires Node 18 or newer (`node --version`). Everything here uses Node
built-ins, so there is nothing else to install.

**Why step 2 is listed separately.** `npm install` does *not* build
`extension/dist/`, and `manifest.json` points at `dist/service-worker.js` — so
loading `extension/` unpacked before anything has built it fails with
"Could not load manifest". `npm run dev` does build it, but `npm run build` is
the one step that only does that, finishes, and exits, which makes it easy to
confirm before you touch `chrome://extensions`. Run it once after cloning and
you can stop thinking about it.

Then load `extension/` unpacked at `chrome://extensions` (Developer mode →
Load unpacked). The extension itself needs no server; `127.0.0.1:8976` only
backs the popup's local test-bench link.

`npm run dev` then runs three things together, stopping them together on
Ctrl-C:

| Part | What it does |
| --- | --- |
| Extension watcher | rebuilds `extension/dist/` on every source change |
| Test-bench bundle | rebuilt only when one of its sources changed (it is ~11 MB) |
| Test-bench server | <http://127.0.0.1:8976> — the URL the popup's ⧉ button opens |

### Reading the startup output

The two lines to watch for mean different things:

- `[dev] Extension built — load … unpacked` — `extension/dist/` now exists, so
  the extension can be loaded at `chrome://extensions`. Loading it before this
  fails with "Could not load manifest".
- `[serve] Test bench on http://127.0.0.1:8976` — the bench page is live from
  this moment. Nothing further to wait for.

Normally both appear in well under a second. The one case that takes longer is
`[dev] Test-bench bundle is missing or out of date` — the bench bundle is
~11 MB and the server only binds after it is rebuilt, so `8976` refuses
connections until then. A `git pull` touching `offscreen.js`, `constants.js`
or the trust-list PEMs is the usual trigger; on Windows, excluding the repo
from on-access antivirus scanning makes a noticeable difference here.

### Port 8976 already in use

Only one `npm run dev` can serve the bench at a time. A second one prints:

```
[dev] Port 8976 is already in use, so this instance will not serve the test bench.
[dev] The extension watcher IS running — extension/dist/ is built and stays up to date.
```

This is a warning, not a failure: the extension still builds and stays
watched, and the bench is being served by the other instance. To take the port
over, stop the other one — find it with `netstat -ano | findstr 8976`
(Windows) or `lsof -i :8976` (macOS/Linux).

### Other commands

```bash
npm run build         # one-shot production build of the extension
npm run build:watch   # extension watcher only, without the test-bench server
```

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull
request to `main` (Dependabot's included) and every push to `main`. It has
read-only permissions and uses no secrets; it builds and checks, nothing more.
One job, **Build and static checks** (Ubuntu, Node 20), runs in order:

1. `npm ci` — fails if `package-lock.json` is out of sync; its postinstall also
   builds the test-bench bundle.
2. `npm run build`, then fails if `extension/dist/service-worker.js` or
   `extension/dist/offscreen.js` is missing.
3. `node scripts/check-syntax.mjs` — parses (never runs) every `.js`/`.mjs`
   file under `extension/src/`, `scripts/` and `c2pa-test-bench/`, skipping
   generated bundles. This is what catches errors in files the build never
   compiles: the content script, popup, detail page and test-bench `app.js`.
   Classic scripts are parsed as classic scripts, modules as modules.
4. `npm test` — the unit tests (see [Tests](#tests)). The step skips itself if
   `package.json` ever loses its `test` script.

Run the same checks locally, in the same order:

```bash
npm ci
npm run build
node scripts/check-syntax.mjs
npm test
```

`npm run build` already fails loudly if it cannot write `extension/dist/`; the
CI existence check is a backstop. To check by hand: `ls extension/dist`
(PowerShell: `Test-Path extension/dist/service-worker.js, extension/dist/offscreen.js`).

**Requiring the check before merge** (a repo admin does this once, after the
workflow has run at least once — GitHub only offers a check name it has seen):
Settings → Branches → Branch protection rules → Add rule (or edit the `main`
rule) → Branch name pattern `main` → tick **Require status checks to pass
before merging** → search for and select **Build and static checks** → Save
changes. (On repos using rulesets instead: Settings → Rules → Rulesets →
the `main` ruleset → **Require status checks to pass** → Add checks →
**Build and static checks**.)

### Tests

```bash
npm run build && npm test
```

`npm test` runs the unit tests in `tests/unit/` with Node's built-in runner
(`node:test`, `node:assert/strict`): no test framework, no browser, no
network. It takes about a second on Node 20 and 24. The build isn't strictly
needed (the tests import `extension/src/` directly), but it is the order CI
uses.

What is covered:

- **Status mapping:** `determineStatus()` on the real pre-extracted manifests
  in `test-assets/trusted/manifest-*` and on synthetic stores.
- **Content classification:** the content classifiers, and `verify()` itself
  with a stand-in SDK (so no WASM runs).
- **Shared modules:** badge map, status labels, messages and constants.
- **Background:** result cache, scan queue, tab media registry, and
  `fetchAsBytes` with a stubbed `fetch`.

Popup, content-script and detail-page rendering need a browser and are not
covered here.

Tests named `KNOWN ISSUE …` pin current behaviour that is known to be wrong
(finding-001, and the popup vs in-page badge disagreement). When the fix
lands, the test must be updated along with it. Tests marked `# TODO` show the
behaviour we want but don't have yet; they are reported but don't fail the
run.

**Adding a test:** create `tests/unit/<name>.test.mjs`. `scripts/run-tests.mjs`
picks up every `*.test.mjs` under `tests/`, so there's nothing to register.
Shared helpers (manifest fixtures, a `chrome` stub, a fake clock, the stand-in
SDK) live in `tests/unit/helpers/`. Mark any hand-made trusted result
"SYNTHETIC — not a real trusted asset".

`scripts/test-status-mapping.mjs` is superseded by
`tests/unit/determine-status.test.mjs` but kept for reference. It always exits
0, so don't rely on it as a check.

## Architecture

```text
Content Script      DOM scan — discovers image and video (MP4) URLs on the page
      │  chrome.runtime.sendMessage
      ▼
Service Worker      Orchestration — fetches bytes, caches results
      │  chrome.runtime.sendMessage
      ▼
Offscreen Document  WASM host — runs @contentauth/c2pa-web verification
      │
      ▼
Popup UI            Renders Scan Results and Live Media panels
```


## Key documents

- [`MIGRATION_AUDIT.md`](MIGRATION_AUDIT.md) — Phase 1 discovery: codebase state before migration
- [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) — Strategy and execution record for extension-only conversion
- [`C2PA_API_NOTES.md`](C2PA_API_NOTES.md) — Real c2pa-web output shape vs UI expectations; field gap analysis
- [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) — Trade-offs and Phase 2 considerations
- [`TOOLING.md`](TOOLING.md) — Development tools used (AI tooling declaration)
- [`test-assets/README.md`](test-assets/README.md) — Test asset inventory and expected results
- [`repo-baseline-assessment.md`](repo-baseline-assessment.md) — Phase 2 restart baseline: what actually exists in the repo, verified by direct inspection
- [`docs/phase2/spike-001-mp4-verification.md`](docs/phase2/spike-001-mp4-verification.md) — MP4 verification spike: findings, raw evidence, Outcome A
- [`docs/phase2/finding-001-expired-signing-certificate.md`](docs/phase2/finding-001-expired-signing-certificate.md) — Open policy question: expired signer certificates read as invalid, independent of format
- [`docs/phase2/test-asset-request.md`](docs/phase2/test-asset-request.md) — Outstanding MP4 fixtures requested from the hosted test bench

<!--## Team

| Name | Role |
| --- | --- |
| Van Thien Phuoc Mai (Lucas) | Extension architecture, WASM migration |
| [Team Member 2] | [Role] |
| [Team Member 3] | [Role] |
| [Team Member 4] | [Role] |
| [Team Member 5] | [Role] |-->

**Industry partner:** Databench Pty Ltd — supervisor Steven
