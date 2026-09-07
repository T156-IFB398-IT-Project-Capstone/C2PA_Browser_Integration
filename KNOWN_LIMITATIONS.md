# Known Limitations and Phase 2 Considerations

## L1 — Trust list scope (UX research finding)

The c2pa-web SDK ships with a narrow embedded CA trust list. During Phase 1
testing, all Adobe (Photoshop, Lightroom, Firefly) and OpenAI (Sora, ChatGPT)
signed assets display as `verified_untrusted`. This is cryptographically
correct — the signatures are valid — but the binary "trusted/untrusted"
labelling creates a UX problem mapping directly to the project's Research
Question 3: how to communicate provenance without confusion or alert fatigue.

Phase 2 design directions: extended bundled trust list, three-tier UI
(Trusted / Known / Unknown), transparent metadata display, or user-configurable
trust additions. Recommend discussion with industry partner.

**Phase 1 partial fix (Step 6.1):** The `verified_untrusted` status label was
relabelled from "Verified — signer not trusted" to "Signed — provider not in
trust list" to reduce the perception of a security warning on legitimate
Adobe/OpenAI content. This does not address the underlying trust-tier UX
question; Phase 2 UX research is still required.

## L2 — Asset size cap

15 MB cap for verification, down from 50 MB in the original hybrid
architecture. Required to keep WASM memory pressure manageable in the
offscreen document context. Larger assets fail with a clear error message.

## L3 — Format support

Phase 1 supports JPEG, PNG, GIF, WebP via c2pa-web. **MP4 is now detected and
verified end-to-end** (Sprint 2): `<video>`/`<source>` discovery landed in
`cec6e10`; a byte-acquisition gap where `fetchAsBytes()` (service-worker.js)
had no `.mp4` Content-Type fallback — unlike the existing jpg/png/gif/webp
branches — was found and fixed on `fix/video-mime-fallback` (see
`docs/phase2/supported-formats-matrix.md` and
`docs/phase2/video-mime-fallback-evidence/`). Confirmed both at the
fetch level (chrome-free harness, pre-fix vs post-fix JSON) and through the
real unpacked extension: `sora.MP4` → `Invalid or changed` (expired signing
cert — see `finding-001-expired-signing-certificate.md`, not a tamper
finding), a synthetic no-manifest MP4 → `No Content Credentials`, image
regression unaffected.

Open caveats, not yet resolved:

- Remux survival (does the BMFF hard binding survive a container rewrite?)
  is still unknown — blocked on a V3 test fixture from Jonah.
- Transcoded/trimmed (V4) and corrupted-manifest (V5) MP4 fixtures are also
  still outstanding.
- Audio is detected by the content script but verification is not enabled.
- MSE-streamed video (`blob:` sources) is excluded by design, not a bug —
  `isVerifiableUrl()` rejects `blob:`/`data:` URLs before they're queued,
  the same treatment `data:` URLs get for images (`content-script.js:98`).
  There is no fetchable URL to acquire bytes from in that case.
- `determineStatus()`'s "Fallback for Invalid" branch fires before its
  TSA-aware branch when a manifest is `Invalid` for a reason other than
  tampering/broken-signature (e.g. an expired cert with a valid TSA
  timestamp) — a pre-existing status-mapping ordering quirk, format-agnostic
  (would affect a JPEG signed with the same certificate identically), not
  introduced or fixed by the video work above.

`test-assets/trusted/sora.MP4` is included as a Phase 2 reference.

## L4 — Hard binding only

Manifests must be embedded in the file (hard binding). Soft binding
(separate manifests matched via visual features) is a Phase 2 stretch goal.

## L5 — Tampered content path untested

`test-assets/tampered/` is empty. The `INVALID_OR_CHANGED` code path is
implemented in the offscreen verifier but lacks runtime test coverage.
Phase 2 should add tampered samples produced via c2patool + manual hex edits.

## L6 — Popup field mapping uses adapter shims

`extension/src/offscreen/offscreen.js` currently adapts c2pa-web's native
output (`claim_generator_info[0].name`, assertion scanning,
`signature_info.common_name`) to the simpler shape `popup.js` expects
(`creator`, `ai_disclosure`, `signer.common_name`). See `C2PA_API_NOTES.md`
§3 for the three field gaps. Phase 2 should refactor popup.js to use
native paths and remove the adapter layer.

## L7 — No UX research yet

The current popup is functional but unrefined. Project Research Question 3
calls for evaluating how provenance information should be communicated.
Phase 2 evaluation methodology is yet to be designed.
