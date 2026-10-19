# Seam documentation

**Audience:** Databench engineers converting this extension into a built-in
MaxBrowser (Chromium/Brave) settings feature.
**Baseline:** tag `v1.0.0-handover` (commit `6a1ea31`). Every file path and
line-level statement below refers to that tag.

A *seam* is a boundary where extension-specific code meets reusable code. At each
seam, Databench keeps one side and replaces the other. Each entry gives the file,
the interface, who calls it, and what Databench replaces.

| # | Seam | Keep | Replace |
|---|---|---|---|
| S1 | Verifier core `verify()` | yes | its transport (the message listener) |
| S2 | Settings store adapter | `settings.js` | `chrome-settings-store.js`, plus the content script's direct read |
| S3 | Message contracts and result model | the result model | the message bus |
| S4 | Result → badge mapping | `badge-map.js` (pure) | the rendering |
| S5 | Trust-anchor configuration | the rule (one PEM string, no fetch) | how the list is shipped and updated |
| S6 | Network settings (remote manifests, identity decoding) | the values | — |
| S7 | Offscreen document boundary | — | removed in a native build |
| S8 | DOM/CSS injection | the wording and rules | the in-page rendering |

---

## S1 — Verifier core: `verify()`

- **File:** `extension/src/offscreen/offscreen.js`
- **Interface:**
  - `verify({ bytes, mimeType })` → `Promise<{ status, manifest, error, perf }>`. `bytes` is a `Uint8Array` or a number array.
  - `verifyDetailed(payload)` returns the same object plus `raw`: the SDK's `validation_state`, `validation_status` and `validation_results`, and `remote_manifest_url`.
  - Also exported: `determineStatus(store)`, `ENGINE_SETTINGS`, `TRUST_ANCHORS_PEM`, `engineInitStatus()`, `remoteManifestUrl(err)`.
- **No `chrome.*` dependency.** The only `chrome` reference is the message listener, guarded by `if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage)`. The module imports nothing extension-specific.
- **Proven importable outside the extension:**
  - In Node: `tests/unit/verify-manifest.test.mjs` and `tests/unit/engine-settings.test.mjs` import it with a stand-in SDK.
  - In a plain web page: the test bench (`c2pa-test-bench/verify-entry.mjs`) and the engine-level check (`tests/engine/harness-entry.mjs`) bundle it unchanged.
- **Callers:** the offscreen message listener (`MSG.VERIFY_REQUEST`), the test bench and the engine-level check.
- **Databench replaces:** the transport only. Call `verify()` directly from the browser's verification context (see S7). If the engine itself is replaced (see `SETTINGS_CONVERSION_GUIDE.md` §4), keep the `VERIFY_STATUS` values and the `determineStatus()` mapping. They are the contract the UI depends on.

## S2 — Settings store adapter (ON/OFF)

- **Files:**
  - `extension/src/shared/settings.js`: no `chrome.*`. Provides `createSettings(store)` → `{ read(), isEnabled(), setEnabled(on) }`, `normaliseSettings()` and `DEFAULT_SETTINGS = { enabled: true }`.
  - `extension/src/shared/chrome-settings-store.js`: the adapter, `{ load(), save(settings) }` over `chrome.storage.local`, using key `c2pa.settings` (`STORAGE_KEYS.SETTINGS`).
- **Callers through the adapter:**
  - The service worker, which refuses `SCAN_ACTIVE_TAB` when OFF (`service-worker.js`, `settings.isEnabled()`).
  - The popup switch (`popup.js`, `setEnabled` / `isEnabled`).
- **Known bypass.** `extension/src/content/content-script.js` reads the setting **directly**:
  - `chrome.storage.local.get('c2pa.settings')` and `chrome.storage.onChanged`, around lines 875–905, with its own copy of the defaulting rule (`readEnabled`).
  - The reason: it is a classic content script and cannot import ES modules.
  - The key is kept in sync by `tests/unit/messages-constants.test.mjs` (the "SETTINGS_KEY (ON/OFF control)" test).
- **Decision (risk R3):** the bypass is **not extracted in v1.0.0**. We recommend that Databench remove it as part of the conversion. In a native build there is no content script reading storage. The page-side component should receive the preference from the browser's preference service, through the same `{ enabled }` shape that `normaliseSettings()` produces.
- **Databench replaces:** `chrome-settings-store.js`, with a store backed by a browser preference, and the content script's direct read. `settings.js` stays as it is.

## S3 — Message contracts and the result model

- **Files:** `extension/src/shared/messages.js` (`MSG`, `msg()`) and `extension/src/shared/constants.js` (`VERIFY_STATUS`, `STORAGE_KEYS`, `SUPPORTED_MIME_TYPES`, `MAX_ASSET_BYTES`).
- **Messages:**

  | Message | From → to | Payload |
  |---|---|---|
  | `c2pa/media_detected` | content → service worker | `{ media, pageUrl }`, for the popup's live media list |
  | `c2pa/scan_active_tab` | popup → service worker → content | content returns `{ ok, media, pageUrl }` |
  | `c2pa/verify_request` | service worker → offscreen | `{ bytes: number[], mimeType }` → `{ status, manifest, error, perf }` |
  | `c2pa/scan_complete` | service worker → content | `{ summary: { count, results: [...] } }`; the content script draws badges |
  | `c2pa/get_tab_media`, `c2pa/media_updated` | popup ↔ service worker | live media list |
  | `c2pa/scroll_to_media` | popup → service worker → content | `{ url, kind }` |
  | `c2pa/get_last_result`, `c2pa/clear_cache`, `c2pa/get_queue_status` | popup → service worker | — |

  The content script repeats the string values it uses, because it is a classic
  script. `tests/unit/messages-constants.test.mjs` checks that they match.
- **Result model** (`VERIFY_STATUS`). The owner is Grace; coordinate any change.

  | Status | Meaning |
  |---|---|
  | `verified_trusted` | Valid signature; signer chains to a bundled trust anchor |
  | `verified_tsa` | Signer not trusted, but a timestamp validates |
  | `verified_untrusted` | Valid signature; signer not on the trust list |
  | `signing_expired` | Certificate expired, no valid timestamp (Valid manifests only) |
  | `content_tampered` | Data/hash mismatch |
  | `broken_signature` | Claim signature invalid |
  | `invalid_or_changed` | Any other Invalid manifest, including expired without a trusted timestamp |
  | `no_credentials` | No manifest found |
  | `unsupported_format` | Set by the service worker for unsupported MIME types |
  | `remote_not_checked` | **New in v1.0.0.** Only a link to an online manifest; not fetched, nothing checked (PR #32) |
  | `'error'` | Engine failure, including the engine refusing its settings |

  The manifest summary (`extractManifest()` in `offscreen.js`) has exactly these
  fields: `creator`, `ai_disclosure`, `ai_source_type`, `has_non_ai_edit`,
  `contentCategory`, `contentHistory`, `signer`, `tsa_info` and `validity_window`.
  This is pinned by `tests/unit/verify-manifest.test.mjs`.
- **Databench replaces:** the message bus. In a native build, verification is a
  function call or an internal IPC, not `chrome.runtime` messaging. The result
  model stays.

## S4 — Result → badge mapping

- **File:** `extension/src/shared/badge-map.js`. It is pure: no DOM and no `chrome.*`.
- **Interface:**
  - `pickBadgeState(item)` returns `'authentic' | 'authentic_edited' | 'ai_edited' | 'ai_generated' | null`.
  - `BADGE_ELIGIBLE_STATUSES` and `BADGE_FILES` are also exported.
- **Callers:** the popup Shield (`popup.js`, via `render-thumb.js`), the detail page, and the test bench (via `verify-entry.mjs`).
- **Not used by the in-page badge.** The content script has its own `pickBadge()` (`content-script.js`), which applies a stricter rule:
  - Content badges are shown only for `verified_trusted`.
  - "AI-Generated" is shown at any trust tier.
  - Everything else with a manifest gets the neutral "Unverified" badge.
  - `remote_not_checked` gets the neutral icon labelled "Credentials online — not checked".
- **The two rules differ.** This is QA fix 3, which is **outstanding** (`KNOWN_LIMITATIONS.md` L12).
- **Databench replaces:** the rendering. Adopt one rule (the in-page rule is the agreed one) and use it everywhere.

## S5 — Trust-anchor configuration

- **Files:**
  - `trust-lists/c2pa-conformance/` holds the official C2PA Trust List and TSA Trust List, plus `SOURCE.json` with the source, commit, retrieval time and SHA-256.
  - `offscreen.js` defines `TRUST_ANCHORS_PEM` and `ENGINE_SETTINGS.trust.trustAnchors`.
- **Rule:** pass the anchors as **one PEM string**. c2pa-web fetches any value that starts with `http`, and every item of an array (`resolveSettings` in the SDK). The engine-level check fails the build if this rule is broken.
- **Evidence:** `docs/phase2/engine-check/after-trust-anchors/` and `docs/phase2/decisions/2026-10-19-trust-anchors.md`.
- **Databench replaces:** how the list is shipped and updated, e.g. with browser component updates. Never by fetching at verification time, unless that is a recorded decision.

## S6 — Network settings: remote manifests and identity decoding

- **File:** `offscreen.js`, `ENGINE_SETTINGS`:
  - `verify.remoteManifestFetch: false`
  - `core.decodeIdentityAssertions: false`
- **Behaviour:**
  - A remote-only manifest makes the engine throw `RemoteManifestUrl("…")`. `remoteManifestUrl()` extracts the URL, and `verifyDetailed()` returns `remote_not_checked`.
  - CAWG identity assertions are not decoded, because decoding them triggers a DID lookup online.
- **Evidence:** `docs/phase2/engine-check/after-remote-manifests/` (no outbound request) and `docs/phase2/decisions/2026-10-19-no-network-verification.md`.
- **Databench replaces:** nothing. Keep these values unless a recorded decision changes the privacy position.

## S7 — Offscreen document boundary

- **Files:** `service-worker.js` (`ensureOffscreen()`, `verifyOne()`), `offscreen.html` and `offscreen.js`.
- **Why it exists:** MV3 service workers cannot host the Web Worker and WASM setup that c2pa-web needs, so verification runs in an offscreen document.
- **The cost:** `chrome.runtime.sendMessage` serialises messages as JSON, so the bytes travel as a plain number array.
- **Measured on 7 Oct** (`perf/results/2026-10-07/README.md`): for video, the median message overhead was **455–522 ms** against **49–68 ms** of verification.
- **Databench replaces:** the whole boundary. In a native build the verifier runs in a process that can hold the bytes directly, so this hop disappears (see `SETTINGS_CONVERSION_GUIDE.md` §3).

## S8 — DOM/CSS injection (in-page badge, tooltip, "More detail")

- **File:** `extension/src/content/content-script.js` (owner: Brian).
- **Mechanism:**
  - Each badged `<img>` or `<video>` is wrapped, and a corner badge icon is added: bottom-right on images, top-right on video. The icons are loaded with `chrome.runtime.getURL('icons/badges/…')` and are web-accessible resources (`extension/manifest.json`).
  - The tooltip and the "More detail" panel are injected DOM. Each element is reset with `all:initial`, so host-page CSS does not bleed in.
  - Switching OFF removes every badge and unwraps every element (`removeAllBadges()`).
- **Known host-page CSS override cases:**
  - An image styled by a parent selector (e.g. `.gallery > img`).
  - `!important` sizing.

  In both cases the image still shifts when wrapped (`KNOWN_LIMITATIONS.md` L10).
- **Databench replaces:** the in-page rendering, e.g. with browser UI (page-info surface, omnibox chip) or an isolated rendering layer. Keep the wording rules. They describe what was checked, never a truth verdict (CLAUDE.md constraint 4). The wording is in `TRUST_STATUS_TEXT`, `CATEGORY_LABEL` and `summarizeResult()`.
