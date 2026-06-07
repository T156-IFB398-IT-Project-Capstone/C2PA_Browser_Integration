# C2PA Browser Extension — Migration Audit
**Branch:** `extension-only-migration`  
**Date:** 2026-05-19  
**Author:** Claude (Phase 1 discovery — no code modified)

---

## 1. Current Architecture

The codebase implements a **hybrid** architecture split across two separate processes:

```
┌─────────────────────────────────────────────┐
│  Browser Extension (extension/)             │
│                                             │
│  content-script.js  ──MEDIA_DETECTED──►     │
│                                             │
│  service-worker.js  ◄──messages──► popup.js │
│       │                                     │
│       │ fetch (HTTP IPC)                    │
└───────┼─────────────────────────────────────┘
        │
        ▼  http://127.0.0.1:8901
┌─────────────────────────────────────────────┐
│  Local Rust HTTP Service (rust-service/)    │
│                                             │
│  Axum HTTP server bound to localhost only   │
│  /api/v1/health  — unauthenticated probe    │
│  /api/v1/verify  — shared-secret auth POST  │
│       │                                     │
│  MockVerifier (NOT real c2pa-rs)            │
│  Pattern-matches JPEG/PNG magic bytes       │
└─────────────────────────────────────────────┘
```

### 1.1 Component Inventory

| File | Context | What it does |
|---|---|---|
| `extension/manifest.json` | Extension metadata | MV3 manifest; declares SW, content scripts, permissions, CSP |
| `extension/src/background/service-worker.js` | Extension SW | Message router; orchestrates fetch → verify → cache → broadcast |
| `extension/src/background/scan-queue.js` | Extension SW | In-memory URL-keyed job deduplication (no external deps) |
| `extension/src/background/tab-media-registry.js` | Extension SW | Per-tab media store keyed by URL (no external deps) |
| `extension/src/content/content-script.js` | Extension content | DOM scanner; MutationObserver; announces media to SW |
| `extension/src/shared/ipc-client.js` | Extension SW | **Rust service HTTP client** — circuit breaker, retry, auth |
| `extension/src/shared/constants.js` | Extension (all) | Central constants — mixed general + Rust-IPC-specific values |
| `extension/src/shared/messages.js` | Extension (all) | Typed chrome.runtime message bus contract |
| `extension/src/shared/result-cache.js` | Extension SW | TTL + LRU in-memory verification result cache (no external deps) |
| `extension/src/popup/popup.html` | Extension popup | UI: scan results tab, live media tab, **settings with shared secret** |
| `extension/src/popup/popup.js` | Extension popup | UI logic: scan flow, live panel, **service health banner** |
| `extension/src/popup/popup.css` | Extension popup | Styles (no external deps, no backend coupling) |
| `extension/icons/` | Extension | PNG icons (16/32/48/128 px) |
| `rust-service/src/main.rs` | **External process** | Axum server entry point; binds `127.0.0.1:8901` |
| `rust-service/src/api.rs` | **External process** | HTTP router; health + verify handlers |
| `rust-service/src/auth.rs` | **External process** | Shared-secret middleware (X-C2PA-Token header) |
| `rust-service/src/config.rs` | **External process** | Auto-generates secret, persists to `config.toml` |
| `rust-service/src/verify.rs` | **External process** | `MockVerifier` — pattern-matches magic bytes, **NOT real C2PA** |
| `rust-service/src/error.rs` | **External process** | Axum error types |
| `rust-service/Cargo.toml` | Build | Rust dependencies (c2pa crate is commented out) |
| `rust-service/.env.example` | Dev docs | Template for Rust service env vars |
| `scripts/smoke-test.sh` | Dev tooling | Bash script that hits the Rust HTTP API directly |
| `test-assets/README.md` | Dev docs | Test case matrix (no actual test files committed) |

---

## 2. Hybrid Dependencies to Remove

The following items explicitly depend on the local Rust service being running on `127.0.0.1:8901`. All must be removed or replaced:

### 2.1 `extension/src/shared/ipc-client.js` — **entire file**
- Implements `checkHealth()` → `GET http://127.0.0.1:8901/api/v1/health`
- Implements `verifyAsset()` → `POST http://127.0.0.1:8901/api/v1/verify`
- Contains circuit breaker, retry loop, and shared-secret auth — all specific to the HTTP IPC channel
- Both exported functions are the only public API of this module; they have no extension-only equivalent yet

### 2.2 `extension/src/background/service-worker.js` — **heavy rewrite**
- `import { verifyAsset, checkHealth }` from `ipc-client.js` — both calls go
- `verifyOne(url)` fetches bytes then calls `verifyAsset()` (Rust IPC) — the `verifyAsset` call must be replaced with c2pa-js WASM call
- `pollHealth()` pings the Rust service `/health` endpoint — remove entirely
- `MSG.TEST_SERVICE` handler calls `pollHealth()` — remove or repurpose
- `HEALTH_POLL_ALARM` / `HEALTH_POLL_INTERVAL_MIN` alarms — polling a dead service makes no sense; remove
- The `ensureAlarms()` call for the health alarm — remove
- `STORAGE_KEYS.HEALTH_STATE` session-storage writes — remove (was health cache for popup)

### 2.3 `extension/src/shared/constants.js` — **partial rewrite**
Lines to remove/replace:
```js
// REMOVE — Rust service endpoint section
export const SERVICE_BASE_URL = 'http://127.0.0.1:8901';
export const API_VERSION      = 'v1';
export const API_PREFIX       = `${SERVICE_BASE_URL}/api/${API_VERSION}`;

// REMOVE — IPC reliability tuning
export const IPC_TIMEOUT_MS    = 10_000;
export const IPC_MAX_RETRIES   = 3;
export const IPC_RETRY_BASE_MS = 400;

// REMOVE — Health poll alarm
export const HEALTH_POLL_ALARM        = 'c2pa.health_poll';
export const HEALTH_POLL_INTERVAL_MIN = 0.5;

// REMOVE — Rust-service-coupled storage keys
STORAGE_KEYS.SHARED_SECRET  // ('c2pa.shared_secret')
STORAGE_KEYS.HEALTH_STATE   // ('c2pa.health_state')
```

### 2.4 `extension/src/popup/popup.html` — **partial rewrite**
Elements tied to the Rust service that must be removed:
- `#service-status` banner ("Checking local service…")
- `#offline-guide` block with `cd rust-service && cargo run` instructions
- Entire `#view-settings` section (shared secret input, "Test connection" button, "cargo run" references)
- `#btn-settings` gear button in the header (opens settings view)

### 2.5 `extension/src/popup/popup.js` — **partial rewrite**
Logic tied to the Rust service:
- `refreshServiceStatus()` — calls `MSG.TEST_SERVICE`; drives the service banner
- `MSG.HEALTH_STATUS_CHANGED` listener — updates banner on health poll events
- `btnScan.disabled = (state !== 'ok')` — scan button is gated on Rust service being UP; must change
- Settings view event handlers (`btnSettings`, `btnBack`, `btnSave`, `btnTest`)
- `showFeedback()` — settings-only feedback helper
- `setServiceBanner()` — the whole concept of a service banner

### 2.6 `extension/src/shared/messages.js` — **minor trim**
- `MSG.TEST_SERVICE` — only ever used to ping the Rust `/health` endpoint
- `MSG.HEALTH_STATUS_CHANGED` — pushed by the health poll loop

### 2.7 `rust-service/` — **entire directory**
The whole Rust sub-project is external to the extension. It is not loaded inside the extension sandbox at any point. It runs as a separate OS process that the user must start manually. In extension-only architecture it has no role.

> **Note:** Do not delete this directory in the first pass. Comment out / flag files in the extension that depend on it, commit that, then delete the Rust tree in a separate commit so git history preserves the original work.

### 2.8 `scripts/smoke-test.sh`
Tests the Rust service HTTP API. Obsolete post-migration. Can be replaced by a simple WASM smoke-test page.

---

## 3. Dependency Audit

### 3.1 npm (`package.json`)

```json
"@contentauth/c2pa-web": "^0.7.0"
```

| Package | Version | Status | Notes |
|---|---|---|---|
| `@contentauth/c2pa-web` | 0.7.0 | ⚠️ Needs investigation | Installed but **not imported anywhere** in current extension code. Includes `@contentauth/c2pa-wasm@0.5.0` (the actual WASM binary). |
| `@contentauth/c2pa-types` | 0.4.3 | ⚠️ Needs investigation | TypeScript type definitions — transitive dep |
| `@contentauth/c2pa-wasm` | 0.5.0 | ⚠️ Needs investigation | WASM binary — transitive dep |
| `highgain` | 0.1.0 | ⚠️ Needs investigation | Utility dep of c2pa-web |
| `ts-deepmerge` | 7.0.3 | ⚠️ Needs investigation | Utility dep of c2pa-web |

**Critical note:** The current canonical npm package for c2pa-js per the [official docs](https://opensource.contentauthenticity.org/docs/js-sdk/) is **`c2pa`** (not `@contentauth/c2pa-web`). `@contentauth/c2pa-web` is an older scoped package; while it exists on npm and resolves without error, it may be a legacy path. Before integrating, we need to confirm whether `@contentauth/c2pa-web` maps to the same WASM engine as the `c2pa` package or whether we should migrate to `c2pa`. This should be clarified before Phase 3 begins — do NOT install anything until we agree.

**Current integration status:** The npm package is declared as a dependency and lock-file-resolved but is **never imported** in any extension JavaScript file. The verification pipeline currently uses only the Rust MockVerifier over HTTP. The `node_modules/` directory is not committed (correctly excluded by `.gitignore`).

### 3.2 Rust (`Cargo.toml`)

| Crate | Purpose | Status |
|---|---|---|
| `tokio` | Async runtime | Remove with Rust service |
| `axum` | HTTP framework | Remove with Rust service |
| `tower` / `tower-http` | HTTP middleware (CORS, tracing) | Remove with Rust service |
| `serde` / `serde_json` | JSON serialization | Remove with Rust service |
| `tracing` / `tracing-subscriber` | Logging | Remove with Rust service |
| `anyhow` / `thiserror` | Error handling | Remove with Rust service |
| `base64` | Base64 encode/decode | Remove with Rust service |
| `rand` | Secret generation | Remove with Rust service |
| `toml` | Config persistence | Remove with Rust service |
| `c2pa` | **Real C2PA crate** | **COMMENTED OUT** — never integrated |

The actual `c2pa` Rust crate (`c2pa-rs`) is commented out in `Cargo.toml` with a `// TODO (Sprint 3+)` note. The Rust service currently ships only the `MockVerifier`, which classifies files by their first few magic bytes — it performs zero cryptographic verification, zero manifest parsing, and zero trust-chain validation.

---

## 4. C2PA Library Usage

### Current state
**None.** Real C2PA library code is not running anywhere in the current system:

- **Rust side:** The `c2pa` crate is commented out. `MockVerifier` in `rust-service/src/verify.rs` returns hardcoded JSON based on JPEG/PNG magic bytes (`FF D8 FF` → `verified_trusted`, `89 50 4E 47` → `verified_untrusted`). This is a fixture for end-to-end UI wiring only.
- **JS side:** `@contentauth/c2pa-web` is in `package.json` but imported nowhere. No WASM is loaded at runtime.

### Target state
`c2pa-js` (either `@contentauth/c2pa-web` or the canonical `c2pa` package — to be confirmed) integrated into the extension service worker:
- Load the WASM binary once during SW startup
- Replace the `verifyAsset()` call in `verifyOne()` with an in-process `c2pa.read(bytes)` call
- Map c2pa-js result fields to the existing `VERIFY_STATUS` enum

---

## 5. Manifest V3 Compliance Check

### 5.1 Passing ✓

| Check | Status | Detail |
|---|---|---|
| `manifest_version: 3` | ✓ Pass | Correct |
| Background: service worker, not persistent page | ✓ Pass | `"service_worker": "..."` with `"type": "module"` |
| No `eval()` / `new Function()` on remote strings | ✓ Pass | None found in codebase |
| No remotely hosted scripts | ✓ Pass | All `<script>` tags reference local paths |
| WASM-safe CSP | ✓ Pass | `'wasm-unsafe-eval'` is the correct MV3 way to allow WASM |
| No inline scripts in HTML | ✓ Pass | `popup.html` uses `<script type="module" src="popup.js">` |
| `content_scripts` uses IIFE (not ESM) | ✓ Pass | `content-script.js` is an IIFE — correct for MV3 content scripts |
| Alarms keepalive | ✓ Pass | Correct pattern for preventing SW termination |

### 5.2 Issues / Flags ⚠️

| # | Location | Issue | Severity | Notes |
|---|---|---|---|---|
| 1 | `manifest.json` → `host_permissions` | `http://127.0.0.1/*` and `http://localhost/*` | **Remove post-migration** | These exist solely to allow fetch() calls to the Rust service. Unnecessary in extension-only. |
| 2 | `manifest.json` → `host_permissions` | `<all_urls>` | **Keep with justification** | Required for the service worker to `fetch()` arbitrary image URLs for WASM verification. CWS reviewers will ask for justification — document it. Cannot be reduced to `activeTab` because service workers cannot use the `activeTab` grant for background fetches. |
| 3 | `manifest.json` → `permissions` | `"scripting"` | **Investigate / remove if unused** | `chrome.scripting` API is not called anywhere in the current codebase. Superfluous permissions increase CWS review friction. |
| 4 | `manifest.json` → `description` | States "hybrid extension + Rust service architecture" | **Must update before publishing** | Inaccurate post-migration; would mislead CWS reviewers. |
| 5 | `manifest.json` → `web_accessible_resources` | Empty array `[]` | Low / cosmetic | Redundant to declare an empty list; remove to reduce manifest noise. |
| 6 | `constants.js` → `MAX_ASSET_BYTES` | 50 MB asset cap | **Flag for team discussion** | Extension service workers run in a shared renderer process; repeatedly loading 50 MB images into ArrayBuffer could pressure the memory budget. c2pa-js may impose its own limits. Consider lowering to 10–15 MB for the WASM path and documenting the trade-off. |

---

## 6. Data Flow Map

### 6.1 Current (hybrid) flow

```
[Web Page DOM]
     │  MutationObserver / initial scan
     ▼
content-script.js
  discoverAllMedia()  ─── chrome.runtime.sendMessage(MEDIA_DETECTED) ──►
  discoverMedia()     ─── chrome.runtime.sendMessage(SCAN_ACTIVE_TAB) ──►

                                         service-worker.js
                                           │  TabMediaRegistry.update()
                                           │  ScanQueue.markInFlight()
                                           │  ResultCache.get()
                                           │
                                           │  fetchAsBytes(url)    [fetch() → ArrayBuffer]
                                           │  bytesToBase64()
                                           │
                                           ▼
                                      ipc-client.js
                                      verifyAsset()
                                           │
                                           │  POST http://127.0.0.1:8901/api/v1/verify
                                           │  Header: X-C2PA-Token: <shared_secret>
                                           │  Body: { source_url, media_type, data_base64 }
                                           │
                                           ▼
                                   rust-service/src/
                                     api.rs → verify.rs
                                     MockVerifier.verify()
                                     (magic-byte pattern match — NOT real C2PA)
                                           │
                                           │  JSON response: { status, manifest, timings_ms }
                                           │
                                           ◄── HTTP response ──────────────────────
                                           │
                                           │  ResultCache.set()
                                           │  chrome.runtime.sendMessage(SCAN_PROGRESS)
                                           │  chrome.runtime.sendMessage(MEDIA_UPDATED)
                                           ▼
                                        popup.js
                                        renderSummary() / renderLiveMedia()

Health poll (every 30s, separate alarm):
  service-worker.js
    pollHealth()
      → GET http://127.0.0.1:8901/api/v1/health
      → chrome.runtime.sendMessage(HEALTH_STATUS_CHANGED)
      → popup.js setServiceBanner()
```

**Verification runs in:** External OS process (`rust-service/`, started manually by the developer with `cargo run`)  
**C2PA logic in use:** None — MockVerifier only

### 6.2 Target (extension-only) flow

```
[Web Page DOM]
     │  MutationObserver / initial scan
     ▼
content-script.js  ← unchanged
  discoverAllMedia()  ─── chrome.runtime.sendMessage(MEDIA_DETECTED) ──►
  discoverMedia()     ─── chrome.runtime.sendMessage(SCAN_ACTIVE_TAB) ──►

                                         service-worker.js
                                           │  TabMediaRegistry.update()  ← unchanged
                                           │  ScanQueue.markInFlight()   ← unchanged
                                           │  ResultCache.get()          ← unchanged
                                           │
                                           │  fetchAsBytes(url)          ← unchanged
                                           │
                                           ▼
                                   [NEW] c2pa-js WASM verifier
                                   (bundled inside extension package)
                                   c2pa.read(bytes, mimeType)
                                   Real manifest parsing + crypto verify
                                   Trust chain check vs bundled CA list
                                           │
                                           │  Result → map to VERIFY_STATUS enum
                                           │
                                           │  ResultCache.set()
                                           │  chrome.runtime.sendMessage(SCAN_PROGRESS)
                                           │  chrome.runtime.sendMessage(MEDIA_UPDATED)
                                           ▼
                                        popup.js
                                        renderSummary() / renderLiveMedia()
                                        (service health banner → removed)
```

**Verification runs in:** Extension service worker sandbox (WASM)  
**C2PA logic in use:** c2pa-js (real manifest parsing, cryptographic signature verification)

---

## 7. Known Trade-offs of Extension-Only Architecture

These should be documented in the team report and discussed at the tutor meeting.

| # | Trade-off | Detail |
|---|---|---|
| T1 | **Memory ceiling** | The extension service worker shares a renderer process. Allocating a 50 MB `ArrayBuffer` for a single image, plus WASM linear memory, puts real pressure on the budget. Very large images (RAW exports, multi-megabyte TIFFs) may fail silently or be rejected. The Rust service had no such constraint — it ran in its own process. |
| T2 | **Bundled CA trust list** | c2pa-js ships with a bundled list of trusted C2PA certificate authorities. The OS certificate store is not accessible from the extension sandbox. This means: (a) trust decisions can lag behind CA revocations until the extension is updated, and (b) enterprise-internal CAs cannot be added by the user. |
| T3 | **WASM startup latency** | The c2pa-js WASM module must be instantiated the first time it is called (or eagerly at SW startup). Cold-start latency is ~50–200 ms on typical hardware. The Rust service, once running, had near-zero per-request overhead. |
| T4 | **No persistent background** | MV3 service workers are terminated after ~30 s of inactivity. The keepalive alarm mitigates this but the WASM module scope is lost on termination and must be re-instantiated. The Rust service stayed alive indefinitely. |
| T5 | **Single-origin content script fetch limits** | Images served with restrictive CORS headers (`no-cors`, opaque responses) may not be readable as bytes by the service worker's `fetch()`. The Rust service had the same limitation but it was less obvious. |
| T6 | **No native file system access** | Hard-binding verification (manifest embedded in file) works fine. Soft-binding (manifest stored adjacent to the file) requires resolving a sidecar URL — the extension can do this via `fetch()` but only for publicly accessible resources. |
| T7 | **Extension size limit (CWS: 128 MB)** | The c2pa-js WASM binary is ~2–5 MB. This is well within limits but must be accounted for in the bundle. |
| T8 | **No user-visible Rust service UX** | The current "offline guide" gives developers clear instructions when the backend is down. Post-migration, WASM failures will be harder to diagnose. Error messages must be improved in the popup. |

---

## 8. Summary: Files by Migration Action

| File | Action | Reason |
|---|---|---|
| `extension/manifest.json` | **Rewrite (partial)** | Remove `http://127.0.0.1/*`, `http://localhost/*`; remove `scripting` perm; remove empty `web_accessible_resources`; update description |
| `extension/src/shared/ipc-client.js` | **Delete (replace)** | Entirely Rust-service-specific; replaced by c2pa-js integration layer |
| `extension/src/shared/constants.js` | **Rewrite (partial)** | Remove service endpoint, IPC tuning, health poll, and Rust-coupled storage keys |
| `extension/src/shared/messages.js` | **Rewrite (minor)** | Remove `TEST_SERVICE` and `HEALTH_STATUS_CHANGED` |
| `extension/src/background/service-worker.js` | **Rewrite (significant)** | Replace `verifyAsset()` call with c2pa-js; remove health polling and all IPC imports |
| `extension/src/background/scan-queue.js` | **Keep as-is** | No external dependencies; pure in-memory logic |
| `extension/src/background/tab-media-registry.js` | **Keep as-is** | No external dependencies; pure in-memory logic |
| `extension/src/shared/result-cache.js` | **Keep as-is** | No external dependencies; pure in-memory logic |
| `extension/src/shared/messages.js` | **Rewrite (minor)** | Remove two Rust-service messages |
| `extension/src/content/content-script.js` | **Keep as-is** | No dependency on Rust service; communicates only with the SW |
| `extension/src/popup/popup.html` | **Rewrite (significant)** | Remove service banner, offline guide, entire settings view |
| `extension/src/popup/popup.js` | **Rewrite (significant)** | Remove health status logic, service banner, settings management |
| `extension/src/popup/popup.css` | **Rewrite (minor)** | Remove CSS classes for service banner, offline guide, settings-specific elements |
| `extension/icons/` | **Keep as-is** | No changes needed |
| `rust-service/` | **Remove (preserve in git)** | Entire directory is the external process; obsolete post-migration |
| `scripts/smoke-test.sh` | **Remove** | Tests the Rust HTTP API; no equivalent target after migration |
| `package.json` | **Update** | Confirm correct c2pa-js package name; may need to switch from `@contentauth/c2pa-web` to `c2pa` |
| `package-lock.json` | **Regenerate** | Will change when `package.json` is updated |

---

## 9. Open Questions (to resolve before Phase 3)

1. **`@contentauth/c2pa-web` vs `c2pa`:** The installed package (`@contentauth/c2pa-web@0.7.0`) is not the same identifier as the canonical `c2pa` package listed in the official docs. The lock file shows `@contentauth/c2pa-wasm@0.5.0` as the underlying WASM binary. We need to verify: is `@contentauth/c2pa-web` the correct browser-optimized entry point, or should we `npm install c2pa` instead? This determines the import path in the new integration layer.

2. **WASM loading strategy in MV3:** c2pa-js typically uses a Web Worker internally for CPU-heavy work. MV3 service workers can spawn `Worker` instances (using `new Worker(new URL('...'))`) but the URL must resolve within the extension package. We need to confirm the c2pa-js API supports being called directly without a separate Worker, or plan for bundling the worker script.

3. **`scripting` permission:** Not used anywhere in current code. Confirm whether it was intentionally reserved before removing it.

4. **Bundler decision:** Currently the extension loads plain JS files directly (no bundler). c2pa-js ships as an npm package. Two options:
   - Add a build step (e.g., `esbuild` or `rollup`) to bundle c2pa-js into the extension
   - Use an importmap or manual copy of the dist files
   This is the biggest new tooling decision of the migration.

5. **`MAX_ASSET_BYTES` cap:** Should we lower the 50 MB limit for the WASM path? The Rust service processed data in its own process memory. In WASM, large buffers compete with the SW's own heap.

---

*Phase 1 complete. No code has been modified. Awaiting review before proceeding to Phase 2 (Migration Plan).*
