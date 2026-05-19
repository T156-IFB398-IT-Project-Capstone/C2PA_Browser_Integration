# C2PA Content Credentials Browser Extension (QUT × Databench)

> IFB398 IT Capstone — Semester 1, 2026

A Chromium browser extension that detects images on web pages, reads embedded C2PA Content Credentials manifests, and cryptographically verifies them using WebAssembly. Built for Databench Pty Ltd targeting MaxBrowser (Chromium/Brave-based). All verification runs locally — no external service, no server, no setup beyond loading the extension.

## Status

Phase 1 (Semester 1) proof-of-concept complete. Extension-only architecture validated end-to-end with real C2PA verification via WebAssembly. Phase 2 (Semester 2): UX refinement, expanded format support, performance evaluation.

## Quick start

```bash
npm install
npm run build
# Load extension/ unpacked at chrome://extensions (Developer mode → Load unpacked)
```

## Architecture

```text
Content Script      DOM scan — discovers image URLs on the page
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

<!--## Team

| Name | Role |
| --- | --- |
| Van Thien Phuoc Mai (Lucas) | Extension architecture, WASM migration |
| [Team Member 2] | [Role] |
| [Team Member 3] | [Role] |
| [Team Member 4] | [Role] |
| [Team Member 5] | [Role] |-->

**Industry partner:** Databench Pty Ltd — supervisor Steven
