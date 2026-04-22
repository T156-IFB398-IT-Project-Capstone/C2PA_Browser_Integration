# C2PA Browser Integration

> QUT IFB398 Capstone — Semester 1, 2026 — Databench Pty Ltd

A browser extension that detects media on web pages, extracts C2PA Content Credentials, and verifies them locally through a hybrid architecture.

## Architecture

```
┌──────────────────────────────────────────────┐
│ Browser Extension (MV3, Chromium)            │
│                                              │
│  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Content      │  │ Background Service    │ │
│  │ Script       │─▶│ Worker                │ │
│  │ (DOM scan)   │  │ (fetch, orchestrate)  │ │
│  └──────────────┘  └──────────┬────────────┘ │
│                               │              │
│  ┌──────────────────────────┐ │              │
│  │ Popup / Side Panel (UI)  │◀┘              │
│  └──────────────────────────┘                │
└───────────────────────┬──────────────────────┘
                        │ JSON over HTTP
                        │ (localhost, shared secret)
                        ▼
┌──────────────────────────────────────────────┐
│ Local Rust Service (native process)          │
│                                              │
│  ┌────────────────────┐  ┌─────────────────┐ │
│  │ Verification       │  │ Certificate     │ │
│  │ Engine (c2pa-rs)   │  │ Validator       │ │
│  └────────────────────┘  └─────────────────┘ │
│                                              │
│  Binds to 127.0.0.1 only. Shared-secret auth.│
└──────────────────────────────────────────────┘
```

**Why hybrid?** Chromium extension sandbox (no OS cert store access, ~512 MB memory cap) cannot do full C2PA verification. Multi-format support (MP4, PDF, WebP) also requires the Rust SDK. See `docs/ARCHITECTURE.md`.

## Repository layout

```
c2pa-browser-integration/
├── extension/          MV3 browser extension (JavaScript)
├── rust-service/       Local verification service (Rust)
├── docs/               Architecture, API contract
├── test-assets/        Sample signed/unsigned media (add locally)
└── scripts/            Dev helpers
```

## Quick start

### Prerequisites

- **Rust** 1.75+ (install via https://rustup.rs)
- **Node.js** 18+ (only for tooling; the extension itself ships plain JS)
- **Chrome / Edge / Brave** or any Chromium-based browser
- macOS, Linux, or Windows

### 1. Start the local Rust service

```bash
cd rust-service
cp .env.example .env      # first run only
cargo run
```

First run generates a shared secret and prints it to the console, e.g.:

```
[c2pa-service] Generated shared secret (save this in the extension popup):
[c2pa-service]   SHARED_SECRET=7f3a...c92b
[c2pa-service] Listening on http://127.0.0.1:8901
```

Copy that secret — you'll paste it into the extension in step 3.

### 2. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`, etc.)
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder
4. The extension icon should appear in the toolbar

### 3. Configure the shared secret

1. Click the extension icon → the popup opens
2. Click **Settings** (gear icon)
3. Paste the `SHARED_SECRET` printed in step 1
4. Click **Save**

The extension is now connected to the local service.

### 4. Try it

1. Navigate to any web page with images
2. Click the extension icon
3. Click **Scan this page**
4. Detected JPEG/PNG images are listed with their verification status

> The current verifier returns **mock results** — the IPC, discovery, and UI are wired end-to-end so the team can slot real `c2pa-rs` verification into `rust-service/src/verify.rs` without touching anything else.

## What's implemented (Sprint 2 vertical slice)

- ✅ MV3 extension scaffold (manifest, content script, background worker, popup)
- ✅ DOM image discovery (JPEG, PNG) + forwarding to the service worker
- ✅ Typed message passing (content ↔ background ↔ popup)
- ✅ Localhost HTTP IPC client with shared-secret auth
- ✅ Rust HTTP service with shared-secret middleware, localhost-only binding, rate-limit hook
- ✅ Stable API contract (`docs/API_CONTRACT.md`) — mock backend slots in for real `c2pa-rs` later

## What's next

- Integrate `c2pa-rs` in `rust-service/src/verify.rs` (replaces the mock)
- Hard-coded trust list loading (owned by Jonah)
- Medium-fidelity UI polish (owned by Brian)
- JPEG APP11 / PNG caBX extraction validation

## License

Coursework for QUT IFB398. See course materials for IP handling.
