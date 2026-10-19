# Settings-conversion guide

**Audience:** Databench engineers turning this extension into a built-in
MaxBrowser (Chromium/Brave) feature, switched ON/OFF in browser settings.
**Baseline:** tag `v1.0.0-handover` (commit `6a1ea31`). Seams are referred to by
the numbers in [`SEAM_DOCUMENTATION.md`](SEAM_DOCUMENTATION.md).

## 1. What the extension does today

1. **Discovery.** The content script finds media on the page: `<img>`, `srcset`,
   `<picture>`, `<video>` posters and sources, and MP4 (`discoverMedia()`).
2. **Request.** The user presses **Scan** in the popup. The service worker asks
   the content script for the list, fetches each asset (`fetchAsBytes()`, 15 MB
   cap), and checks a 5-minute result cache.
3. **Verification.** The service worker sends the bytes to the offscreen document,
   where `verify()` runs c2pa-web 0.13.1 (WASM). At most 3 verifications run at
   once (`SCAN_CONCURRENCY`).
4. **Display.** Results go back to the content script, which draws quiet corner
   badges with a tooltip and a "More detail" panel. The popup shows a list with a
   Shield badge and a status label, and the detail page shows one result in full.
5. **ON/OFF.** The popup switch stores `{ enabled }`. When OFF, scanning is refused
   and every badge is removed. When switched back ON, the last results are redrawn.

## 2. Component mapping

| Extension component | File(s) | Extension-specific? | Native (browser-built-in) equivalent |
|---|---|---|---|
| Verifier core: `verify()`, `determineStatus()`, `extractManifest()` | `extension/src/offscreen/offscreen.js` | **No** (no `chrome.*`, S1) | Reuse as-is inside the browser's verification process, or port its mapping logic if the engine changes (§4) |
| Engine settings and trust anchors | `offscreen.js` (`ENGINE_SETTINGS`), `trust-lists/c2pa-conformance/` | **No** (S5, S6) | Same settings. The list is shipped by the browser's update channel (§5). |
| Result model and wording | `shared/constants.js`, `shared/status-label.js`, `shared/badge-map.js` | **No** | Reuse |
| Settings logic | `shared/settings.js` | **No** (S2) | Reuse, backed by a browser preference |
| Settings storage | `shared/chrome-settings-store.js`; direct read in `content-script.js` | **Yes** | A browser preference (§7); remove the content script's direct read |
| Result cache, scan queue, tab media registry | `shared/result-cache.js`, `background/scan-queue.js`, `background/tab-media-registry.js` | Mostly no (tab lifecycle uses `chrome.tabs` events) | Reuse the logic; hook it to the browser's tab and navigation events |
| Service worker (orchestration, byte fetch, offscreen management) | `background/service-worker.js` | **Yes** | A browser-side service in the browser or a utility process. Fetching should reuse the page's already-loaded resource where possible. |
| Offscreen document | `offscreen/offscreen.html` and listener | **Yes** (S7) | **Removed**: the verifier runs where it can hold the bytes (§3) |
| Content script (discovery and badges) | `content/content-script.js` | **Yes** (S8) | A renderer-side component (a Blink/renderer feature or an isolated-world script) for discovery. Badges via browser UI or an isolated layer. |
| Popup, detail page | `popup/`, `detail/` | **Yes** | Page-info / site-details surface, plus a settings-page toggle |
| Message bus | `shared/messages.js` | **Yes** (S3) | Direct calls or internal IPC |

**Reusable without change:** everything under `shared/` except
`chrome-settings-store.js`, plus the verifier core in `offscreen.js`. These are
exactly the modules the unit tests import in Node.

## 3. Why the offscreen byte-transfer hop disappears

Chrome MV3 service workers cannot run c2pa-web's Web Worker and WASM setup. So the
extension verifies inside an offscreen document and sends the bytes there with
`chrome.runtime.sendMessage`. That API serialises messages as JSON, so the bytes
travel as a plain number array.

Measured on 7 Oct 2026 (`perf/results/2026-10-07/README.md`; `main` `654a59d`,
Chrome 154, n = 3 per scenario):

| Scenario | Result |
|---|---|
| Single image, cold | **87 ms** detection → result (22.6 ms of it verification) |
| 100-item page | **10.7 s** in total, with 3 verifications in flight; median per-item service time 245.5 ms (p95 579 ms) |
| Video (10 per run) | median message overhead **455–522 ms** against **49–68 ms** of verification |

Most of the per-item cost is **moving bytes to the verifier, not verifying them**.
In a native build, the verifier runs in a process that receives the bytes directly
(from the network stack or the renderer's resource cache). The JSON number-array
hop, and most of that overhead, goes away.

Two caveats:
- This run measured the build **before** the trust anchors and network settings
  were added (PRs #31 and #32). Performance with the 55-certificate anchor set has
  **not been measured**.
- `performance.memory` does not include WASM linear memory, and `reader.free()` is
  not called, so the engine's memory footprint is not measured
  (`KNOWN_LIMITATIONS.md` L13).

## 4. Engine options

| Option | Notes |
|---|---|
| **Keep c2pa-web (WASM)** | Lowest-risk port: the engine-level check (`tests/engine/`) already proves its behaviour with these settings. It needs a context that can run WASM and a Web Worker (a utility process or a hidden renderer). Pre-1.0, so pin exactly and upgrade deliberately (`ENGINE_VERSION_RECORD.md`). |
| **Native C2PA SDK (c2pa-rs, Rust)** | c2pa-web 0.13.1 is c2pa-rs **0.90.1** compiled to WASM (source-path strings in `c2pa_bg.wasm`; `ENGINE_VERSION_RECORD.md`). Linking c2pa-rs natively avoids the WASM and worker layer. c2pa-web passes `ENGINE_SETTINGS` to c2pa-rs in snake_case (`trust.trust_anchors`, `verify.remote_manifest_fetch`, `core.decode_identity_assertions`), so the same configuration applies. The team's Phase 1 research documents (not in this repository) identified the Rust SDK as the most mature implementation. |

Whichever engine is used, keep three things:
- the `VERIFY_STATUS` values and `determineStatus()` mapping (S3),
- the no-network settings (S6),
- the engine-level check, re-pointed at the new engine. It is the only test that
  proves engine behaviour; the unit suite uses a stand-in SDK.

## 5. Trust-list management

- **Today:** the official **C2PA Trust List** and **C2PA TSA Trust List** (C2PA
  Conformance Program, `c2pa-org/conformance-public` commit `47009ee`) are bundled
  as one PEM string. Provenance is in `trust-lists/c2pa-conformance/SOURCE.json`.
  The decision is `docs/phase2/decisions/2026-10-19-trust-anchors.md`.
- **Limitation:** the list is as current as the release that ships it. It is
  **not** real-time validation, and there is no OCSP/CRL revocation checking.
- **Update procedure** (`trust-lists/c2pa-conformance/README.md`):
  1. Download both files pinned to a commit.
  2. Check the git blob ids.
  3. Update `SOURCE.json`.
  4. Run `npm test` and the engine-level check.
- **In the browser:** ship the list through the browser's component-update
  mechanism, as with other root stores. Keep the "one string, no fetch at
  verification time" rule. A live fetch needs a recorded decision.
- **TSA:** c2pa-web 0.13.1 has no separate TSA trust setting, so both lists form one
  anchor set. Whether timestamps from listed TSAs are trusted is **not evidenced**:
  no sample uses one.

## 6. Privacy rules

- **No outbound request during verification.** This is enforced by
  `verify.remoteManifestFetch: false` and `core.decodeIdentityAssertions: false`,
  and proven by `docs/phase2/engine-check/after-remote-manifests/`: no outbound
  request, with a capture self-test in the same run.
- Credentials stored only online are shown as **"not checked"**
  (`remote_not_checked`), never fetched.
- CAWG identity assertions are not validated. Enabling them, or remote manifests,
  means a network request to a third party, which needs a recorded decision.
- Byte fetching itself (`fetchAsBytes()`) re-requests the media URL the page
  already shows. In a native build, prefer the already-loaded resource so no
  second request is made.

## 7. ON/OFF switch → browser preference

- `settings.js` already exposes the behaviour behind a store adapter:
  `createSettings(store)` → `isEnabled()` / `setEnabled(on)`, with a default of ON.
- Replace `chrome-settings-store.js` with a store backed by a browser preference,
  e.g. a boolean preference registered by the feature and shown on the settings
  page.
- Remove the content script's direct `chrome.storage` read (S2). Pass the
  preference to the page-side component.
- Required behaviour when OFF:
  - no scanning,
  - no verification,
  - every badge removed and every wrapped element restored.
- When switched back ON, the last results are redrawn without a new scan.

## 8. Post-conversion test checklist

Run against the converted build. The expected states are those of
`docs/phase2/engine-check/after-remote-manifests/` (engine `0.13.1`, settings as at
the tag).

- [ ] **Engine-level checks re-pointed at the new engine:**
  - [ ] Network capture self-test.
  - [ ] Settings applied, with no silent fallback.
  - [ ] Anchors active (control).
  - [ ] No outbound request during verification.
- [ ] **Sample states:**

  | Sample | Expected state |
  |---|---|
  | `car.jpg` | `verified_tsa` |
  | `ChatGPTgen.png` | `invalid_or_changed` |
  | `crater-lake.jpg` | `remote_not_checked` |
  | `cloudscape.jpeg` | `invalid_or_changed` |
  | `sora.MP4` | `invalid_or_changed` |

- [ ] A signer under a listed CA reads `verified_trusted` (use the control method in `tests/engine/run.mjs`).
- [ ] A no-credentials image reads "No Content Credentials", and the wording says this does not mean the image is fake.
- [ ] Tampered and broken-signature fixtures (`c2pa-test-bench/assets/`) read "Content tampered" and "Broken signature".
- [ ] MP4 is verified, and the badge is placed clear of the player controls.
- [ ] Preference OFF: no scanning and no badges. ON again: the previous results return.
- [ ] Badge layout does not shift page content (`docs/phase2/ui-test-checklist.md`; known cases L10).
- [ ] The wording makes no truth claim (CLAUDE.md constraint 4; `tests/unit/status-label.test.mjs`).
- [ ] The unit suite passes (`npm test`) for the reused modules.

## 9. Known limitations to carry into the conversion

From `KNOWN_LIMITATIONS.md` at the tag:
- **Trust list:** it ships with each release and is not real-time; there is no
  revocation checking.
- **CAWG identity:** identity assertions are not decoded, so not validated.
- **Remote manifests:** they are not fetched (shown as "not checked").
- **Remux:** remuxing drops the C2PA box. This was reported by the 12 Oct final QA;
  the repository evidence is still outstanding (L6).
- **Streaming:** MSE-streamed (`blob:`) media cannot be verified.
- **Stripped metadata:** it cannot be told apart from never-signed media.
- **Expired certificates:** without a trusted timestamp they read "Invalid or
  changed". The archival policy is Databench's decision (finding-001).
- **Badge rules:** QA fixes 3 and 4 (badge-rule alignment, timestamp label, fixture
  labels) are outstanding.
- **MaxBrowser:** not tested; only Chrome has been verified.
