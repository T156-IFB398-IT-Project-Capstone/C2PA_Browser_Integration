# C2PA Browser Extension — Migration Plan

**Branch:** `extension-only-migration`
**Date:** 2026-05-19
**Status:** Awaiting approval before any code changes
**Prerequisite:** `MIGRATION_AUDIT.md` (Phase 1) reviewed and approved ✓

---

## Resolved Questions (from Phase 1 open items)

### Q1 — npm Package: `@contentauth/c2pa-web` ✓

**Recommendation: keep `@contentauth/c2pa-web`.** Research confirms this IS the official browser SDK from Content Authenticity Initiative. The alternative `c2pa` package on npm is a different, unrelated project. `@contentauth/c2pa-web@0.7.0` (already in `package.json`) is the correct dependency. No package swap needed.

### Q2 — Web Worker Requirement: Offscreen Document Required ⚠️

**Critical architectural finding:** `@contentauth/c2pa-web` spawns `new Worker()` internally to run the WASM engine on a separate thread. **MV3 service workers cannot reliably host this pattern** — the worker script is bundled inline as a blob URL, which Chrome's service worker security policy blocks. This is not a limitation of our setup; it is a Chrome platform constraint.

**Solution: Chrome Offscreen Document API** (`chrome.offscreen`). This is the official MV3 pattern for background contexts that need Web Worker or DOM access. A hidden, persistent page is created by the service worker; all c2pa-web calls are delegated to it via message passing. The offscreen document is a normal page context with full Worker + WASM support.

```
Service Worker  ──  MSG.VERIFY_REQUEST  ──►  Offscreen Document
                                               (c2pa-web WASM runs here)
Service Worker  ◄──  MSG.VERIFY_RESULT  ──   Offscreen Document
```

This adds one new permission (`"offscreen"`) and two new source files (`offscreen.html`, `offscreen.js`). It is CWS-publishable and the pattern Chrome's own docs recommend for exactly this use case.

---

## Phase 2 — Migration Plan

---

### Section 1: Remove

Items to delete. First-pass strategy: comment out + mark `// TODO: removed for extension-only migration — see MIGRATION_AUDIT.md`, commit, then hard-delete in a follow-up commit. This preserves reviewable diffs.

| #  | Item                                   | Reason                                                                                                                                              |
| -- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 | `rust-service/` (entire directory)   | External OS process; replaced by WASM in offscreen document. Preserve for one commit after extension is working, then delete in a dedicated commit. |
| R2 | `scripts/smoke-test.sh`              | Tests the Rust HTTP API. Replaced by manual testing against c2pa-js.                                                                                |
| R3 | `extension/src/shared/ipc-client.js` | Entire file is Rust-service HTTP client. Replaced by the offscreen messaging layer.                                                                 |

---

### Section 2: Rewrite

Items that require significant changes. Each listed sub-change is one logical unit; they may span multiple git commits.

#### R4 — `extension/manifest.json`

- [ ] Remove `http://127.0.0.1/*` and `http://localhost/*` from `host_permissions` (Rust service IPC URLs — no longer needed)
- [ ] Remove `"scripting"` from `permissions` (confirmed unused in all code)
- [ ] Remove `"web_accessible_resources": []` (empty; redundant noise)
- [ ] Add `"offscreen"` to `permissions` (required for `chrome.offscreen` API)
- [ ] Update `"description"` to remove "hybrid extension + Rust service architecture" language
- [ ] Add `extension/dist/service-worker.js` as the background service worker path (post-esbuild)
- [ ] Add `extension/dist/offscreen.js` as a referenced script (loaded by offscreen.html)
- [ ] Keep `"wasm-unsafe-eval"` in CSP — required for WASM in the offscreen page

#### R5 — `extension/src/shared/constants.js`

Remove the following exported constants (they are Rust-service-specific):

- [ ] `SERVICE_BASE_URL`, `API_VERSION`, `API_PREFIX` (Rust HTTP endpoint)
- [ ] `IPC_TIMEOUT_MS`, `IPC_MAX_RETRIES`, `IPC_RETRY_BASE_MS` (IPC retry tuning)
- [ ] `HEALTH_POLL_ALARM`, `HEALTH_POLL_INTERVAL_MIN` (health polling)
- [ ] `STORAGE_KEYS.SHARED_SECRET` (shared secret storage key)
- [ ] `STORAGE_KEYS.HEALTH_STATE` (health cache storage key)

Update the following:

- [ ] Lower `MAX_ASSET_BYTES` from `50 * 1024 * 1024` to `15 * 1024 * 1024` (15 MB cap for WASM path — see Trade-offs T1)
- [ ] Add new constants for offscreen messaging: `OFFSCREEN_URL`, `OFFSCREEN_REASON`

#### R6 — `extension/src/shared/messages.js`

- [ ] Remove `MSG.TEST_SERVICE` (pinged the Rust `/health` endpoint)
- [ ] Remove `MSG.HEALTH_STATUS_CHANGED` (pushed by the Rust health poll loop)
- [ ] Add `MSG.VERIFY_REQUEST` (SW → offscreen: request WASM verification of one asset)
- [ ] Add `MSG.VERIFY_RESULT` (offscreen → SW: response with manifest + status)

#### R7 — `extension/src/background/service-worker.js`

Remove:

- [ ] `import { verifyAsset, checkHealth } from '../shared/ipc-client.js'` (dead import after R3)
- [ ] `pollHealth()` function and all call sites
- [ ] `MSG.TEST_SERVICE` handler block
- [ ] `HEALTH_POLL_ALARM` alarm creation in `ensureAlarms()`
- [ ] `HEALTH_POLL_ALARM` branch in `chrome.alarms.onAlarm.addListener`
- [ ] `STORAGE_KEYS.SHARED_SECRET` and `STORAGE_KEYS.HEALTH_STATE` references
- [ ] `bytesToBase64()` helper (the Rust service required base64; c2pa-js takes raw bytes or Blob)

Rewrite:

- [ ] `verifyOne(url)`: Replace the `verifyAsset()` call with a message to the offscreen document (`MSG.VERIFY_REQUEST`). The offscreen document returns `{ status, manifest, error }` in the same shape. The fetch-to-bytes path (`fetchAsBytes()`) stays unchanged.
- [ ] `ensureOffscreen()`: Add a helper that creates the offscreen document if it does not exist (using `chrome.offscreen.createDocument()`). Call before the first verification in a scan run; the document persists until the SW terminates.
- [ ] Service banner: The `_lastHealth` state variable and its broadcast go away. No replacement needed — WASM is always "ready" once the offscreen document is alive.

Keep (unchanged):

- [ ] `fetchAsBytes(url)` — fetch and size-check logic
- [ ] `runConcurrent()` — bounded concurrency runner
- [ ] `scanActiveTab()` — content script ping + task fan-out
- [ ] `broadcastMediaUpdate()` — registry → popup push
- [ ] All `TabMediaRegistry`, `ScanQueue`, `ResultCache` usage
- [ ] `MSG.MEDIA_DETECTED`, `MSG.GET_TAB_MEDIA`, `MSG.SCAN_ACTIVE_TAB`, `MSG.GET_LAST_RESULT`, `MSG.CLEAR_CACHE`, `MSG.GET_QUEUE_STATUS` handlers
- [ ] `chrome.tabs.onRemoved` / `chrome.tabs.onUpdated` lifecycle handlers
- [ ] `chrome.runtime.onInstalled` / `chrome.runtime.onStartup` hooks
- [ ] Keepalive alarm (`KEEPALIVE_ALARM` — 24 s) — still needed for SW termination prevention

#### R8 — `extension/src/popup/popup.html`

Remove these elements:

- [ ] `#service-status` service banner div
- [ ] `#offline-guide` div (contains `cargo run` instructions)
- [ ] Entire `#view-settings` section (shared secret input, "Test connection" button, `cargo run` references, field hints)
- [ ] `#btn-settings` gear button in the header

Replace with:

- [ ] A small static indicator in the header: e.g. a `#verify-status` chip that shows "Verifying…" during a scan and "Ready" at idle. This replaces the service health banner with a simpler, always-positive state that reflects WASM readiness. No settings gear needed.

The two-tab layout (Scan Results / Live Media) stays completely unchanged.

#### R9 — `extension/src/popup/popup.js`

Remove:

- [ ] `btnSettings`, `btnBack`, `btnSave`, `btnTest`, `inputSecret`, `feedback`, `offlineGuide` DOM refs
- [ ] `btnSettings.addEventListener('click', ...)` — settings view open
- [ ] `btnBack.addEventListener('click', ...)` — settings view close
- [ ] `btnSave.addEventListener('click', ...)` — save shared secret
- [ ] `btnTest.addEventListener('click', ...)` — test Rust connection
- [ ] `showFeedback()` helper (settings-only)
- [ ] `refreshServiceStatus()` function (calls `MSG.TEST_SERVICE`)
- [ ] `MSG.HEALTH_STATUS_CHANGED` branch in the push-message listener
- [ ] Fast-path session-storage health read in `init()` (step 2)
- [ ] `setServiceBanner()` function
- [ ] `btnScan.disabled = (state !== 'ok')` gate (scan button gated on Rust being up)
- [ ] `STORAGE_KEYS.HEALTH_STATE` reference in `init()`

Replace with:

- [ ] `btnScan.disabled = false` on load — scan is always available (WASM is ready)
- [ ] Update `init()` to remove health-check step; remaining init steps (restore last scan, pre-populate live badge) stay unchanged
- [ ] A simple `setVerifyStatus(busy)` helper that toggles the new `#verify-status` chip between "Ready" and "Verifying…" — called at scan start and scan end

#### R10 — `extension/src/popup/popup.css`

- [ ] Remove CSS classes no longer referenced: `.service-banner`, `.service-banner--ok`, `.service-banner--down`, `.service-banner--unknown`, `.offline-guide`, `.offline-title`, `.offline-body`, `.offline-cmd`, `.feedback`, `.feedback--ok`, `.feedback--err`, `.field`, `.field-label`, `.field-hint`
- [ ] Add styles for the new `#verify-status` chip (small, inline, accent-coloured)
- [ ] Keep all scan result, live panel, tab bar, progress bar, badge, and brand styles

---

### Section 3: Keep As-Is

No changes to these files.

| File                                               | Reason                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `extension/src/background/scan-queue.js`         | Pure in-memory, no external deps                                    |
| `extension/src/background/tab-media-registry.js` | Pure in-memory, no external deps                                    |
| `extension/src/shared/result-cache.js`           | Pure in-memory, no external deps                                    |
| `extension/src/content/content-script.js`        | No dependency on Rust service; speaks only to SW via chrome.runtime |
| `extension/icons/`                               | No changes needed                                                   |
| `test-assets/README.md`                          | Docs only; still relevant                                           |

---

### Section 4: Add

New components to create.

#### A1 — `extension/src/offscreen/offscreen.html`

Minimal HTML shell for the offscreen document. Loads `offscreen.js`. Must declare `<meta charset>` and nothing else — it is never visible to the user.

```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body><script src="../../dist/offscreen.js"></script></body>
</html>
```

The offscreen document URL is registered in the manifest via `web_accessible_resources` or as a direct extension page URL.

#### A2 — `extension/src/offscreen/offscreen.js`

The WASM host. Responsibilities:

- Import `createC2pa` from `@contentauth/c2pa-web`
- On load, call `createC2pa({ wasmSrc: chrome.runtime.getURL('dist/c2pa_bg.wasm') })` — or use the inline import path `@contentauth/c2pa-web/inline` to avoid serving the WASM separately
- Listen for `MSG.VERIFY_REQUEST` messages from the SW
- Call `c2pa.reader.fromBlob(mediaType, new Blob([bytes], { type: mediaType }))` (or equivalent API)
- Map c2pa-js result fields to the `VERIFY_STATUS` enum values expected by the existing result rendering code
- Respond to the SW with `{ status, manifest, error }`

Result mapping (c2pa-js → existing VERIFY_STATUS):

```
c2pa-js: active manifest present + trust chain valid  → 'verified_trusted'
c2pa-js: active manifest present + cert not trusted   → 'verified_untrusted'
c2pa-js: validation error / hash mismatch             → 'invalid_or_changed'
c2pa-js: no manifest found                            → 'no_credentials'
c2pa-js: format not supported / parse error           → 'unsupported_format'
```

> **Note:** The c2pa-js API contract has not been validated against the expected fields for `manifest` (currently the mock returns `creator`, `ai_disclosure`, `signer.common_name`). Validate against the real c2pa-js output and update `renderItem()` in `popup.js` accordingly. This is the first time real C2PA data will flow through the UI.

#### A3 — esbuild build script (`package.json` scripts + `build.mjs` or inline)

Add `esbuild` as a `devDependency`. Add a `build` script that:

- Bundles `extension/src/background/service-worker.js` → `extension/dist/service-worker.js` (handles ES module imports from shared/)
- Bundles `extension/src/offscreen/offscreen.js` → `extension/dist/offscreen.js` (includes `@contentauth/c2pa-web` and all its WASM dependencies)
- Copies `c2pa_bg.wasm` from `node_modules/@contentauth/c2pa-wasm/` to `extension/dist/` (if not using the inline WASM path)
- Popup and content-script may not need bundling (they use direct browser ES module loading), but the offscreen and service-worker do

**Note:** Before installing esbuild or running `npm install`, ask for confirmation per the project constraints.

```json
"scripts": {
  "build": "node build.mjs",
  "build:watch": "node build.mjs --watch"
},
"devDependencies": {
  "esbuild": "^0.21.0"
}
```

#### A4 — `.gitignore` update

Add `extension/dist/` exclusion — already present in `.gitignore` (`extension/dist/`). Confirm it's there (it is).

#### A5 — `KNOWN_LIMITATIONS.md`

To be created in Phase 3 final step. Will document:

- 15 MB asset size cap and why (WASM memory pressure)
- Bundled CA trust list (vs OS cert store)
- WASM startup latency on first scan
- Offscreen document lifecycle (destroyed when SW terminates)
- SW keepalive pattern and its limits
- No soft-binding support in Phase 1
- CORS-restricted images cannot be verified

---

### Section 5: Migration Order

Dependencies between changes are noted. Each step is one atomic git commit unless stated otherwise.

```
Step 1 — Build tooling (prerequisite for everything)
  ├── Ask permission to install esbuild
  ├── Add esbuild devDependency (npm install --save-dev esbuild)
  ├── Write build.mjs (two entry points: service-worker + offscreen)
  ├── Add npm scripts (build, build:watch)
  ├── Run build once to confirm tooling works (output to dist/)
  └── Commit: "build: add esbuild bundler for extension"

Step 2 — Offscreen document (new component, no breakage yet)
  ├── Create extension/src/offscreen/offscreen.html (A1)
  ├── Create extension/src/offscreen/offscreen.js with c2pa-js init (A2)
  ├── Validate c2pa-js API against real manifest output (document findings)
  └── Commit: "feat: add offscreen document with c2pa-js WASM verifier"

Step 3 — Messages and constants (shared contract; touch before dependents)
  ├── Update messages.js: remove TEST_SERVICE, HEALTH_STATUS_CHANGED; add VERIFY_REQUEST, VERIFY_RESULT (R6)
  ├── Update constants.js: remove Rust-IPC constants, lower MAX_ASSET_BYTES to 15 MB (R5)
  └── Commit: "refactor: update shared constants and messages for extension-only"

Step 4 — Service worker rewrite (depends on Steps 1, 2, 3)
  ├── Remove ipc-client.js import
  ├── Remove pollHealth(), health alarm, health storage, bytesToBase64()
  ├── Add ensureOffscreen() using chrome.offscreen API
  ├── Rewrite verifyOne() to message the offscreen document
  ├── Remove MSG.TEST_SERVICE handler
  ├── Run build; smoke-test by loading extension and scanning a test page
  └── Commit: "feat: replace Rust IPC with WASM offscreen verification in service worker"

Step 5 — Manifest update (depends on Step 4)
  ├── Remove 127.0.0.1 and localhost from host_permissions
  ├── Remove scripting permission
  ├── Remove web_accessible_resources: []
  ├── Add offscreen permission
  ├── Update description
  ├── Point background service_worker to dist/service-worker.js
  └── Commit: "fix: update manifest.json for extension-only architecture"

Step 6 — Popup UI cleanup (depends on Step 3; independent of Steps 4-5 mostly)
  ├── Update popup.html: remove service banner, offline guide, settings view, gear button; add verify-status chip (R8)
  ├── Update popup.js: remove all Rust-service logic, simplify init() (R9)
  ├── Update popup.css: remove dead classes, add verify-status chip styles (R10)
  ├── Validate real c2pa-js manifest fields against renderItem() in popup.js — update field mappings
  └── Commit: "feat: update popup UI for extension-only — remove service dependency"

Step 7 — Delete ipc-client.js (depends on Step 4 being fully working)
  ├── Confirm no remaining imports of ipc-client.js (grep check)
  ├── Delete extension/src/shared/ipc-client.js
  └── Commit: "remove: delete ipc-client.js (Rust service HTTP client)"

Step 8 — Delete Rust service (after extension is verified working end-to-end)
  ├── Delete rust-service/ directory entirely
  ├── Delete scripts/smoke-test.sh
  ├── Delete rust-service/.env.example
  └── Commit: "remove: delete rust-service and smoke-test script"

Step 9 — Documentation (Phase 3 final step)
  ├── Update README.md to reflect extension-only architecture
  ├── Write ARCHITECTURE.md with new data flow diagram
  ├── Finalise MIGRATION_AUDIT.md with "Changes Applied" section
  └── Write KNOWN_LIMITATIONS.md (A5)
  └── Commit: "docs: update architecture docs for extension-only migration"
```

---

### Section 6: Known Trade-offs

Documented for the team report and tutor meeting. (Will be expanded in `KNOWN_LIMITATIONS.md` in Phase 3.)

| #  | Trade-off                              | Impact                                                                                                                                                                                       | Mitigation                                                                                                                                                                                                          |
| -- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 | **15 MB asset size cap**         | Images larger than 15 MB are silently skipped. The Rust service ran in its own process with no such limit.                                                                                   | Show a clear "Asset too large (max 15 MB)" message in the popup result row. Document in KNOWN_LIMITATIONS.md.                                                                                                       |
| T2 | **Bundled CA trust list**        | c2pa-js ships a pinned list of trusted C2PA certificate authorities. Users cannot add enterprise/internal CAs. Trust decisions may lag CA revocations until the extension updates.           | Document in KNOWN_LIMITATIONS.md. Flag as Phase 2 improvement (allow user-provided CA bundles via settings).                                                                                                        |
| T3 | **WASM startup latency**         | First verification in a session takes ~50–200 ms to instantiate the WASM module. Subsequent calls are fast. The Rust service amortized this across all users; each SW instantiates its own. | `ensureOffscreen()` is called eagerly at SW startup so the WASM is warm before the user clicks Scan.                                                                                                              |
| T4 | **Offscreen document lifecycle** | The offscreen document is created by the SW and destroyed when the SW terminates. On SW restart, the document must be recreated. The keepalive alarm (24 s) reduces restart frequency.       | `ensureOffscreen()` always checks before use; creation cost is low (~50 ms).                                                                                                                                      |
| T5 | **CORS-restricted images**       | Images served with opaque CORS policies cannot be read as bytes by the service worker's `fetch()`. This was also true for the Rust service but less visible.                               | Detect `fetch()` failures and surface a "Cannot access this image" status in the popup rather than silently failing.                                                                                              |
| T6 | **Offscreen permission**         | Adding `"offscreen"` to `permissions` requires CWS justification.                                                                                                                        | Justification: "Required to run WebAssembly-based C2PA cryptographic verification in a dedicated background context, as MV3 service workers do not support the Web Worker API required by the c2pa-js WASM engine." |
| T7 | **Larger extension bundle**      | The WASM binary (~2–5 MB) and bundled c2pa-js code significantly increase the installed extension size vs the current plain-JS setup.                                                       | Still well under the 128 MB CWS limit. Document in KNOWN_LIMITATIONS.md.                                                                                                                                            |
| T8 | **No real C2PA baseline yet**    | The Rust MockVerifier never parsed real manifests. Phase 3 will be the first time real C2PA data flows through the popup UI. Field names in `renderItem()` may not match c2pa-js output.   | Validate c2pa-js manifest output in Step 2 before touching the UI. Update field mappings as needed.                                                                                                                 |

---

### Section 7: Pre-Publish Checklist (Chrome Web Store)

Items that must be resolved before submitting to CWS. Not all are required to complete Phase 3.

- [ ] **MV3 compliance:** `manifest_version: 3` ✓ (already correct)
- [ ] **Service worker, not persistent page:** ✓ (already correct)
- [ ] **No `eval()` or remote code execution** ✓ (already clean)
- [ ] **No remotely hosted scripts** ✓ (c2pa-js will be bundled locally)
- [ ] **`scripting` permission removed** (Step 5)
- [ ] **`http://127.0.0.1/*` and `http://localhost/*` removed** (Step 5)
- [ ] **`<all_urls>` host permission justified in CWS listing:** "Required to fetch image bytes from arbitrary web origins for local C2PA manifest verification. No data leaves the user's device."
- [ ] **`offscreen` permission justified:** Documented above (T6)
- [ ] **Manifest description updated** (Step 5)
- [ ] **Icon set complete:** 16/32/48/128 px PNG icons present ✓ (already in `extension/icons/`)
- [ ] **Privacy policy URL:** Required by CWS before publishing. Not written yet — flag for team.
- [ ] **CWS developer account:** Requires $5 one-time registration fee. Not in scope for Phase 3.
- [ ] **Extension name / description copy:** "C2PA Content Credentials (QUT x Databench)" is acceptable for dev; may need adjustment for public listing.
- [ ] **No bundled secrets or API keys:** ✓ (shared secret concept is removed entirely)
- [ ] **WASM inline vs URL:** If using `@contentauth/c2pa-web/inline`, the WASM is base64-encoded in the bundle. If using URL mode, `c2pa_bg.wasm` must be in the extension package and listed appropriately. Confirm in Step 2.
- [ ] **`web_accessible_resources`:** The offscreen HTML page does not need to be web-accessible (it's an extension page, not injected into web content). Confirm no new `web_accessible_resources` entries are needed.

---

*Phase 2 complete. No code has been modified. Awaiting approval before proceeding to Phase 3 (execution).*
