# Finding 001 — expired signing certificate produces `Invalid`, independent of format

**Raised during:** SPIKE-001 (MP4 verification)
**Status:** open policy question — not a defect, no fix proposed here

## What was observed

Verifying `test-assets/trusted/sora.MP4` (OpenAI Sora, signed 2025-10-10)
against the pinned `c2pa-web` 0.7.0 build produces `validation_state: "Invalid"`.
An independent oracle capture of the same file (`test-assets/trusted/manifest-sora`,
produced separately by Adobe's web inspector) recorded `validation_state: "Valid"`
for the identical manifest content.

Field-by-field, the two runs agree everywhere that matters to the manifest's
integrity:

| Field | Oracle | This run (2026-08-03) |
|---|---|---|
| `claimSignature.validated` | success | success |
| `claimSignature.insideValidity` | success | success |
| `assertion.bmffHash.match` | success, "BMFF hash valid" | success, "BMFF hash valid" |
| `timeStamp.validated` | success | success |

They diverge on exactly one point: this run's `validation_status` additionally
reports `signingCredential.expired` ("certificate expired"), which the oracle
capture did not report. Both runs agree the certificate is `untrusted` (not on
c2pa-web's bundled trust list — the same condition already documented in
`KNOWN_LIMITATIONS.md` L1). The overall `validation_state` is the aggregate of
every check; one new failure is enough to flip it from `Valid` to `Invalid`.

## What this means

- The hash binding is intact. The signature is cryptographically valid. The
  TSA timestamp confirms the signature was created while the certificate was
  still within its validity window.
- Despite that, the SDK reports `Invalid` overall, because certificate expiry
  is evaluated against **current wall-clock time**, not solely against the
  TSA-anchored signing time. A signature that was unquestionably legitimate
  at the moment it was made can transition from `Valid` to `Invalid` later,
  purely due to the passage of time, with nothing about the asset itself
  having changed.
- **This is format-agnostic.** Nothing about this observation is specific to
  MP4 or BMFF hard binding — a JPEG signed with the same certificate would
  show the identical transition. It surfaced during the MP4 spike only
  because `sora.MP4` happens to be the fixture used, not because of anything
  video-specific.

## Why it matters beyond this one file

The set of legitimate, unaltered, correctly-signed content whose certificate
has since expired can only grow over time — it is a one-way ratchet as the
corpus of C2PA-signed content ages. This is especially relevant to:

- **Archival and historical material** — content signed years ago, verified
  today, would show the same `Invalid` result as tampered content, with no
  way for the current five-state result model to distinguish "this was
  altered" from "this was fine, but the cert has since lapsed."
- **Test/demo corpora** — any fixture signed with a fixed certificate has a
  shelf life before it starts reporting `Invalid` for reasons unrelated to
  what it was built to demonstrate. (Raised separately with Jonah in
  `docs/phase2/test-asset-request.md`.)
- **Trust and status wording** — Hard Constraint #4 (no traffic-light
  semantics, absence of credentials must never read as evidence of falsity)
  already governs how the product talks about untrusted signers. Whether
  "expired but everything else checks out" should be communicated the same
  way as "tampered" is an open question this finding raises but does not
  answer.

## Who this is for

This is recorded as an open policy question for:

- **The team**, to decide whether the result model should distinguish
  "expired signer" from "invalid/tampered content" at all, and if so, how.
- **Jonah's trust workstream**, since certificate expiry and trust-list scope
  are adjacent concerns (both currently collapse into "not fully verified"
  states with different underlying causes).
- **The project owner (Steven)**, since this affects how confidently the
  product can make provenance claims about content that was legitimately
  signed but whose signer's certificate has since lapsed — a question of
  product positioning, not implementation.

No fix is proposed in this document. This is a record of what was observed
and why it is a decision, not a bug.
