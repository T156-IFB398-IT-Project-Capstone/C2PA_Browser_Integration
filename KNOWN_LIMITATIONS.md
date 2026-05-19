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

Phase 1 supports JPEG, PNG, GIF, WebP via c2pa-web. Video (MP4) and audio
are detected by the content script but verification is not yet enabled.
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
