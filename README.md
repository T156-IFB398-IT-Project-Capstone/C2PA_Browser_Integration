# C2PA Browser Integration

> QUT IFB398 Capstone — Semester 1, 2026 — Databench Pty Ltd

A browser extension that detects and tracks media on web pages, extracts C2PA Content Credentials, and verifies them locally through a hybrid architecture combining a Chromium MV3 extension with a local Rust verification service.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Browser Extension (MV3, Chromium)                        │
│                                                          │
│  ┌─────────────────┐   ┌──────────────────────────────┐  │
│  │ Content Script  │──>│ Background Service Worker    │  │
│  │ - DOM scan      │   │ - IPC: timeout/retry/CB      │  │
│  │ - MutationObs.  │   │ - TabMediaRegistry           │  │
│  │ - video/audio   │   │ - ResultCache (5 min TTL)    │  │
│  │   detection     │   │ - ScanQueue (dedup)          │  │
│  └─────────────────┘   │ - Keepalive alarm (24 s)     │  │
│                        │ - Health poll alarm (30 s)   │  │
│  ┌─────────────────┐   └──────────────┬───────────────┘  │
│  │ Popup UI        │<─────────────────┘                  │
│  │ - Scan Results  │   push: SCAN_PROGRESS               │
│  │ - Live Media    │        HEALTH_STATUS_CHANGED        │
│  └─────────────────┘        MEDIA_UPDATED                │
└─────────────────────────────┬────────────────────────────┘
                              │ JSON over HTTP (localhost)
                              │ shared-secret auth
                              ▼
┌──────────────────────────────────────────────────────────┐
│ Local Rust Service (native process, 127.0.0.1:8901)      │
│                                                          │
│  ┌──────────────────────┐  ┌─────────────────────────┐   │
│  │ Verification Engine  │  │ Auth Middleware         │   │
│  │ (MockVerifier now;   │  │ (constant-time HMAC     │   │
│  │  c2pa-rs slot ready) │  │  shared-secret check)   │   │
│  └──────────────────────┘  └─────────────────────────┘   │
│  Binds to 127.0.0.1 only. External callers cannot reach. │
└──────────────────────────────────────────────────────────┘
```

**Why hybrid?** The Chromium extension sandbox has no OS certificate store access and a ~512 MB memory cap, making full C2PA trust-chain verification impractical. Multi-format support (MP4, PDF, WebP) also requires the Rust `c2pa-rs` SDK. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository layout

```
c2pa-browser-integration/
├── extension/              MV3 browser extension (JavaScript)
│   └── src/
│       ├── background/
│       │   ├── service-worker.js      Orchestration, verification pipeline
│       │   ├── scan-queue.js          In-flight URL deduplication
│       │   └── tab-media-registry.js  Per-tab realtime media store
│       ├── content/
│       │   └── content-script.js     DOM scanner + MutationObserver
│       ├── popup/
│       │   ├── popup.html            Scan Results + Live Media tab UI
│       │   ├── popup.css
│       │   └── popup.js
│       └── shared/
│           ├── constants.js          Tunable values, enums
│           ├── messages.js           Typed runtime message bus
│           ├── ipc-client.js         Fault-tolerant Rust service client
│           └── result-cache.js       TTL-based verification result cache
├── rust-service/           Local verification service (Rust + Axum)
├── docs/                   Architecture, API contract
├── test-assets/            Sample signed/unsigned media (add locally)
└── scripts/                Dev helpers
```

## Quick start

### Prerequisites

- **Rust** 1.75+ — install via [https://rustup.rs](https://rustup.rs)
- **Chrome / Edge / Brave** (any Chromium-based browser)
- macOS, Linux, or Windows

### 1. Start the local Rust service

```bash
cd rust-service
cp .env.example .env      # first run only
cargo run
```

On first run a shared secret is generated and printed:

```
================================================================
[c2pa-service] Generated shared secret (save this in the extension popup):
[c2pa-service]   SHARED_SECRET=7f3a...c92b
================================================================
[c2pa-service] Listening on http://127.0.0.1:8901
```

Copy that secret — paste it into the extension in step 3.

### 2. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`, etc.)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. The extension icon appears in the toolbar

### 3. Configure the shared secret

1. Click the extension icon → popup opens
2. Click the **⚙ gear icon** → Settings
3. Paste the `SHARED_SECRET` from step 1
4. Click **Save**, then **Test connection** — you should see "Service online"

### 4. Try it

**Scan for Content Credentials:**

1. Navigate to any web page with images
2. Click the extension icon → **Scan Results** tab
3. Click **Scan this page**
4. Detected images appear with their C2PA verification status

**Live media tracking:**

1. Click the extension icon → **Live Media** tab
2. The panel populates automatically as the page loads
3. Scroll the page or navigate SPAs — new media appears within ~3 seconds
4. The badge count on the tab button updates in real time

> The current verifier returns **mock results**: JPEGs report as `verified_trusted`, PNGs as `verified_untrusted`. The full pipeline (discovery → IPC → UI) is wired end-to-end so the team can slot real `c2pa-rs` verification into `rust-service/src/verify.rs` without touching anything else.

## What's implemented

### Sprint 1/2 — Foundational pipeline

- MV3 extension scaffold (manifest, content script, service worker, popup)
- DOM image discovery (JPEG, PNG) with typed message passing
- Localhost HTTP IPC client with shared-secret authentication
- Rust HTTP service: shared-secret middleware, localhost binding, mock verifier
- Settings view: shared secret storage, connection test
- Stable API contract (`docs/API_CONTRACT.md`)

### Sprint 3 — Reliability and stability

- **MV3 keepalive:** `chrome.alarms` fires every 24 s to prevent SW termination
- **Periodic health polling:** 30 s alarm; result pushed to popup via `HEALTH_STATUS_CHANGED`
- **IPC fault tolerance:** 10 s timeout, 3-attempt retry with exponential backoff, circuit breaker (threshold: 3 failures, cooldown: 15 s)
- **Parallel verification:** bounded concurrency (3 simultaneous verifications)
- **Per-item progress bar:** `SCAN_PROGRESS` push messages drive the popup progress bar
- **Expanded media detection:** `srcset`, `<picture><source>`, `<video poster>`, GIF, WebP
- **MutationObserver:** detects dynamically-injected media in SPAs and infinite-scroll pages
- **Offline guide:** popup shows `cargo run` instructions when the backend is unreachable
- **Session storage fast path:** popup reads cached health state from `chrome.storage.session` before the first round-trip
- **Rust build:** zero compiler warnings; MockVerifier correctly returns `unsupported_format` for non-image MIME types

### Sprint 3/4 — Realtime media tracking

- **`TabMediaRegistry`:** per-tab in-memory store; cleared on navigation and tab close
- **`discoverAllMedia()`:** content script detects images, video (src/poster), audio, and blob URLs
- **`MEDIA_UPDATED` push:** background broadcasts the updated media list to the popup whenever new items are detected
- **Live Media panel:** separate popup tab showing all detected media with kind badges (image, video, audio), verifiable indicators, and blob warnings
- **Live count badge:** tab button shows item count; updates in real time without switching panels
- **Tab isolation:** `_currentTabId` filtering ensures the popup shows data only for the correct tab
- **`ResultCache`:** 5-minute TTL, 200-entry LRU-style in-memory cache (Sprint 4 prep)
- **`ScanQueue`:** URL-keyed state machine preventing duplicate in-flight verifications (Sprint 4 prep)

## What's next (Sprint 4)

- Integrate real `c2pa-rs` verification in `rust-service/src/verify.rs`

- Background pre-verification triggered by `MEDIA_DETECTED` (scaffolding already in place)
- Verification status overlay on Live Media panel items
- Persistent `TabMediaRegistry` via `chrome.storage.session` (survives SW restart)
- Per-tab verification history panel
- JS unit tests for `ScanQueue`, `ResultCache`, `TabMediaRegistry`, and `ipc-client` circuit breaker

## License

Coursework for QUT IFB398. See course materials for IP handling.
