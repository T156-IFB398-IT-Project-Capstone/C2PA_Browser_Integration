# Known Limitations

Documented for the team report, tutor meetings, and Phase 2 planning.
Cross-reference: `MIGRATION_PLAN.md` Section 6 (Trade-offs T1–T8).

---

## L1 — 15 MB asset size cap

Images larger than 15 MB are silently rejected before being sent to the WASM verifier.
The previous Rust service ran in its own OS process with no enforced limit.

**Why:** The WASM verifier runs inside the extension's offscreen document. Chrome limits
extension renderer memory, and loading a 50 MB image into a WASM heap risks OOM crashes.
15 MB covers the vast majority of real-world web images.

**Phase 2:** Expose a clear "Asset too large (max 15 MB)" status in the popup result row
rather than the current silent skip.

---

## L2 — Bundled CA trust list

`@contentauth/c2pa-web` ships a pinned list of trusted C2PA certificate authorities. The
extension cannot consult the OS certificate store or a user-configured CA bundle.

**Practical effect:** All test assets signed by Adobe (including those from the Adobe Content
Credentials web inspector) currently return `validation_state: "Valid"` rather than
`"Trusted"`, because Adobe's signing CA is not in c2pa-web's embedded trust list. The
extension surfaces these as `verified_untrusted` ("Verified — signer not trusted").
This is correct behavior for the trust configuration, not a bug.

See `test-assets/README.md` for the full trust-state caveat and which assets are affected.

**Phase 2:** Investigate c2pa-web's trust-list configuration API; allow users to supply
additional CA bundles via extension settings.

---

## L3 — WASM startup latency

The first verification in a session takes approximately 50–200 ms while the WASM module
instantiates inside the offscreen document. Subsequent calls within the same session reuse
the already-initialised SDK instance and are fast (~5–20 ms).

**Mitigation already in place:** `ensureOffscreen()` is called eagerly at service worker
startup (`onInstalled`, `onStartup`), so the WASM is warm before the user clicks Scan in
most cases.

---

## L4 — Offscreen document lifecycle

The offscreen document is created by the service worker and destroyed when Chrome terminates
the service worker (typically after ~30 s of inactivity, despite the 24 s keepalive alarm).
On SW restart, `ensureOffscreen()` recreates the document before the next verification.

**Cost of recreation:** ~50 ms to create the document + L3 WASM startup latency on the first
verification after a restart. Total is usually under 300 ms and is not user-visible because
the scan begins before results are expected.

---

## L5 — CORS-restricted images

Images served with opaque CORS policies (e.g., `cross-origin` without `Access-Control-Allow-Origin: *`)
cannot be read as bytes by the service worker's `fetch()` call. These silently become fetch
errors and are reported as `status: 'error'` in the popup.

This limitation also existed with the Rust service but was less visible because the service
ran as a separate process with different origin rules.

**Phase 2:** Detect fetch CORS failures specifically and surface a distinct
"Cannot access this image (CORS)" status rather than a generic error.

---

## L6 — No tampered-content test coverage

The `test-assets/tampered/` folder is empty. The `invalid_or_changed` code path in the
verification pipeline (`stateToStatus("Invalid")`) has not been exercised with a real
tampered asset.

**Phase 2:** Generate tampered samples using `c2patool` and hex editing, and add them to
`test-assets/tampered/` to validate the `INVALID_OR_CHANGED` pipeline end-to-end.

---

## L7 — Hard-binding only (no soft-binding)

Phase 1 supports C2PA hard-binding only — the manifest is embedded directly inside the
image file container (JUMBF box for JPEG/PNG, etc.). Soft-binding, where a manifest is
stored separately and matched to content via visual fingerprinting or perceptual hashing,
is not implemented.

**Phase 2 stretch goal:** Investigate c2pa-web's soft-binding API and the C2PA
soft-binding specification once the Phase 1 pipeline is stable.

---

## L8 — Video format not verified

MP4 and other video containers are detected by the content script and displayed in the
Live Media panel (kind: `video`), but are not submitted to the WASM verifier. The
`SUPPORTED_MIME_TYPES` list in `constants.js` covers JPEG, PNG, GIF, and WebP only.

`test-assets/trusted/sora.MP4` is included for future testing once video support is
enabled.

**Phase 2:** Confirm c2pa-web's MP4 support, add `video/mp4` to `SUPPORTED_MIME_TYPES`,
and test against `sora.MP4`.

---

## L9 — Popup field mapping uses adapter shims

`extension/src/offscreen/offscreen.js` currently adapts `c2pa-web`'s real output shape to
the field paths that `popup.js` `renderItem()` expects. Three shims are in place:

| Shim | popup.js expects | c2pa-web actual path |
| --- | --- | --- |
| creator | `manifest.creator` | `claim_generator_info[0].name` |
| ai_disclosure | `manifest.ai_disclosure` (bool) | no direct field — inferred from assertion labels |
| signer | `manifest.signer.common_name` | `signature_info.common_name` |

See `C2PA_API_NOTES.md` §3 for full detail on each gap.

**Phase 2:** Refactor `popup.js` `renderItem()` to read native c2pa-web field paths and
remove the adapter layer in `offscreen.js`.
