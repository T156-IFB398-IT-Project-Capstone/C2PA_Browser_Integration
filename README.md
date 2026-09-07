# C2PA Content Credentials Browser Extension (QUT × Databench)

> IFB398 IT Capstone — Semester 1, 2026

A Chromium browser extension that detects images and video (MP4) on web pages, reads embedded C2PA Content Credentials manifests, and cryptographically verifies them using WebAssembly. Built for Databench Pty Ltd targeting MaxBrowser (Chromium/Brave-based). All verification runs locally — no external service, no server, no setup beyond loading the extension.

## Status

Phase 1 (Semester 1) proof-of-concept complete. Extension-only architecture validated end-to-end with real C2PA verification via WebAssembly, for images.

Phase 2 (Semester 2): SPIKE-001 confirmed `c2pa-web` parses and validates MP4's BMFF hard binding against a real signed asset (Outcome A — see `docs/phase2/spike-001-mp4-verification.md`), and the scan pipeline (content-script discovery → service worker → offscreen WASM verifier) now handles video the same way it handles images. Known follow-ups tracked in `docs/phase2/`: remux survival is still untested (Q3, blocked on a fixture), and a signing-certificate-expiry effect (`finding-001`) means a legitimately-signed asset can read as invalid once its signer's certificate lapses — independent of video, applies to any format.

## Getting started

A fresh clone needs nothing beyond these two commands — no `.env`, no API keys,
no external service, no separate server checkout.

```bash
git clone -b feat/sprint2-3-ui-with-dev-setup <repo-url>
cd C2PA_Browser_Integration
npm install     # installs deps, then builds the test-bench bundle (postinstall)
npm run dev     # extension watcher + test-bench server, in one terminal
```

Requires Node 18 or newer (`node --version`) — `npm run dev` uses only Node
built-ins, so there is nothing else to install.

`npm run dev` runs three things together and stops them together on Ctrl-C:

| Part | What it does |
| --- | --- |
| Extension watcher | rebuilds `extension/dist/` on every source change |
| Test-bench bundle | rebuilt only when one of its sources changed (it is ~11 MB) |
| Test-bench server | <http://127.0.0.1:8976> — the URL the popup's ⧉ button opens |

Then load `extension/` unpacked at `chrome://extensions` (Developer mode →
Load unpacked). The extension itself needs no server; `127.0.0.1:8976` only
backs the popup's local test-bench link.

If the server reports the port is in use, an earlier `npm run dev` is probably
still running — find it with `netstat -ano | findstr 8976` (Windows) or
`lsof -i :8976` (macOS/Linux).

### Other commands

```bash
npm run build         # one-shot production build of the extension
npm run build:watch   # extension watcher only, without the test-bench server
```

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
