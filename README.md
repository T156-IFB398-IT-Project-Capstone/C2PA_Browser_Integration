# C2PA Content Credentials Browser Extension (QUT × Databench)

> IFB398 IT Capstone — Semester 1, 2026 — Databench Pty Ltd

A Chromium browser extension that detects images on web pages, reads embedded C2PA Content Credentials manifests, and cryptographically verifies them using WebAssembly — entirely inside the browser, with no external service required. Targeted at MaxBrowser (Chromium/Brave-based) as the deployment platform for Databench Pty Ltd.

## Architecture

```
Content Script  (DOM scan — discovers image URLs on the page)
      │  chrome.runtime.sendMessage
      ▼
Service Worker  (orchestration — fetches bytes, caches results, routes messages)
      │  chrome.runtime.sendMessage
      ▼
Offscreen Document  (WASM host — runs @contentauth/c2pa-web verification)
      │
      ▼
Popup UI  (renders Scan Results and Live Media panels)
```

Verification runs entirely on the user's machine inside the extension sandbox — no server, no network call beyond the original image fetch.

## Quick start

```bash
git clone <REPO_URL> c2pa-browser-integration
cd c2pa-browser-integration
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. The C2PA Verify icon appears in the toolbar

To test against local files, enable **Allow access to file URLs** on the extension's detail page.

## Project layout

```
c2pa-browser-integration/
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── background/
│   │   │   ├── service-worker.js      Orchestration, verification pipeline
│   │   │   ├── scan-queue.js          In-flight URL deduplication
│   │   │   └── tab-media-registry.js  Per-tab realtime media store
│   │   ├── content/
│   │   │   └── content-script.js      DOM scanner + MutationObserver
│   │   ├── offscreen/
│   │   │   ├── offscreen.html         Offscreen document shell
│   │   │   └── offscreen.js           WASM host — c2pa-web verification
│   │   ├── popup/
│   │   │   ├── popup.html             Scan Results + Live Media tab UI
│   │   │   ├── popup.css
│   │   │   └── popup.js
│   │   └── shared/
│   │       ├── constants.js           Tunable values, enums
│   │       ├── messages.js            Typed runtime message bus
│   │       └── result-cache.js        TTL-based verification result cache
│   └── dist/                          esbuild output (gitignored)
├── test-assets/                       Signed/unsigned/tampered sample media
├── scripts/                           Dev helpers
├── build.mjs                          esbuild build script
├── KNOWN_LIMITATIONS.md               Phase 1 trade-offs and Phase 2 items
├── TOOLING.md                         AI tooling declaration (academic transparency)
├── MIGRATION_AUDIT.md                 Phase 1 migration audit
├── MIGRATION_PLAN.md                  Phase 2 migration plan
└── C2PA_API_NOTES.md                  c2pa-web API findings and field gap notes
```

## Tech stack

- **Manifest V3** — Chrome extension platform
- **esbuild** — JavaScript bundler (service worker + offscreen document)
- **@contentauth/c2pa-web** (inline WASM mode) — official C2PA browser SDK from the Content Authenticity Initiative; wraps `c2pa-rs` compiled to WebAssembly
- **Chrome Offscreen Document API** (`chrome.offscreen`) — MV3 pattern for hosting Web Workers and WASM in a background context
- **TabMediaRegistry / ScanQueue / ResultCache** — in-memory per-tab media tracking and result caching

## Status

**Phase 1 (Semester 1) — complete.** Extension-only architecture validated end-to-end with real C2PA-signed test assets. Adobe-signed images correctly return `verified_untrusted` with creator and signer fields populated via the `@contentauth/c2pa-web` WASM verifier.

**Phase 2 (Semester 2) — planned.** UI/UX refinement, tampered-content testing, video format support, custom trust list support, performance evaluation, and Chrome Web Store submission preparation. See `KNOWN_LIMITATIONS.md` for the full Phase 2 backlog.

## Documentation

| File | Purpose |
| --- | --- |
| [`MIGRATION_AUDIT.md`](MIGRATION_AUDIT.md) | Phase 1 audit — hybrid → extension-only gap analysis |
| [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) | Phase 2 migration plan — step-by-step execution record |
| [`C2PA_API_NOTES.md`](C2PA_API_NOTES.md) | `c2pa-web` API findings, field gaps, and VERIFY_STATUS mapping |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Phase 1 trade-offs, known gaps, Phase 2 planning items |
| [`TOOLING.md`](TOOLING.md) | AI-assisted development declaration (QUT academic transparency) |
| [`test-assets/README.md`](test-assets/README.md) | Test asset inventory, trust-state caveat, expected results |

## Team

| Name | Role |
| --- | --- |
| Van Thien Phuoc Mai (Lucas) | Extension architecture, WASM migration |
| [Team Member 2] | [Role] |
| [Team Member 3] | [Role] |
| [Team Member 4] | [Role] |
| [Team Member 5] | [Role] |

**Industry partner:** Databench Pty Ltd — supervisor Steven

## License

Coursework for QUT IFB398. See course materials for IP handling.
