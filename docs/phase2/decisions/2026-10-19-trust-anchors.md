# Decision: bundle the official C2PA trust lists as trust anchors

- **Date:** 19 October 2026
- **Decided by:** Lucas Mai (Technical Lead), 19 Oct 2026 Phase 0 answers. Trust-model owner Jonah Schmidley to review (see the end of this note).
- **Status:** Implemented on branch `feat/trust-anchors` (QA fix 1, risk R20)

## Context

The final QA of 12 Oct found that no trust anchors were configured for C2PA
signers. The only trust setting the extension passed was
`cawgTrust.verifyTrustList`, which concerns CAWG identity assertions. The engine-level check confirms it:
in [`engine-check/before/`](../engine-check/before/README.md) every sample reports
`signingCredential.untrusted`. So no result could reach "Verified — trusted",
and the in-page "Verified", "Verified · Edited" and "AI-Edited" badges were unreachable.

## Decision

1. Ship the **official C2PA Trust List** and **C2PA TSA Trust List** inside the
   extension package. They are published by the C2PA Conformance Program in
   `c2pa-org/conformance-public` (`trust-list/`, licence CC-BY-4.0) and stored under
   [`trust-lists/c2pa-conformance/`](../../../trust-lists/c2pa-conformance/README.md).
2. Pass both to c2pa-web 0.13.1 as **one PEM string** in `trust.trustAnchors`
   (`extension/src/offscreen/offscreen.js`, `TRUST_ANCHORS_PEM`). A URL or an array
   is never used, because the SDK fetches those over the network (seen in the SDK
   source, `node_modules/@contentauth/c2pa-web/dist/c2pa-*.js`, `resolveSettings`).
   **Nothing is fetched at verification time** (CLAUDE.md constraint 3).
3. Remove the silent fallback. If the engine rejects its settings, verification
   returns an error result instead of quietly running with SDK defaults (no trust,
   remote fetching on).
4. Update the lists **with each release**, following the procedure in
   `trust-lists/c2pa-conformance/README.md`. No live fetch is allowed without a new
   recorded decision.

## Source record

| Item | Value |
|---|---|
| Repository | https://github.com/c2pa-org/conformance-public (README: "The C2PA Trust List and the C2PA TSA Trust List are under the `trust-list` directory") |
| Commit | `47009eedfe6721edd0ce3e69b89c1101cd6f03e5` ("Automated Sync: Update trust lists", 2026-10-17T13:47:21Z) |
| Retrieved | 2026-10-19T04:35:24Z, with `curl` from `raw.githubusercontent.com/c2pa-org/conformance-public/<commit>/trust-list/<file>` |
| `C2PA-TRUST-LIST.pem` | 32 certificates, 40,108 bytes, SHA-256 `b3949271a07b007e92ef1d18050b55388f5e0d2686a16fd864176c48421af8ae`, git blob `4335aa06abd4…` (equal to the blob id GitHub reports for the path) |
| `C2PA-TSA-TRUST-LIST.pem` | 23 certificates, 30,118 bytes, SHA-256 `7182cb227c02701be0eebd67ab635fca7f85431c32796fb53b267c657cd2c675`, git blob `0b97844a6008…` (equal to the blob id GitHub reports for the path) |

The same values are kept in `trust-lists/c2pa-conformance/SOURCE.json`. `npm test`
(`tests/unit/engine-settings.test.mjs`) fails if a file stops matching them.
`.gitattributes` turns off line-ending conversion, so the bytes stay identical to
upstream.

## Comparison with the April 2026 PEMs

The team committed copies of the same two lists on 28 Apr 2026 (`08d4390`,
`trusted-certs/`) and removed them in `92b9875` (24 Aug, PR #11). The April files
(from `92b9875^`) are compared below with the October files by certificate
SHA-256 fingerprint:

| List | April 2026 | October 2026 | Unchanged | Added | Removed | Expired in October list |
|---|---|---|---|---|---|---|
| C2PA Trust List | 20 certificates (SHA-256 `862664c5…0442`) | 32 | 20 | 12 | 0 | 0 |
| C2PA TSA Trust List | 15 certificates (SHA-256 `9ba9ace3…dd8c`) | 23 | 15 | 8 | 0 | 0 |

The October lists add these issuers:
- **C2PA Trust List:** Verimago (root and issuing CA), Snowball (root and claim-signing ICA), Encypher (root and issuing CA), TrustAsia (RSA and ECC roots), RealReel (root), Castlabs (root), and NETLOCK (root and claim-signing CA).
- **TSA list:** Snowball (root and TSA ICA), Encypher (root and TSA issuing CA), TrustAsia (RSA and ECC roots), Castlabs (root), and NETLOCK (TSA CA).

## Evidence of effect (engine-level check)

From [`engine-check/after-trust-anchors/`](../engine-check/after-trust-anchors/README.md), commit `95f47e5`:

- `engine-settings-applied`: **PASS**. The engine accepted the settings, with 55 certificates in one PEM string.
- `trust-anchors`: **PASS**, via the test-only control. A separate engine instance was given the
  production anchors with one more CA certificate appended *at the end*: Adobe
  Product Services G4, taken from `car.jpg`'s own embedded chain. With it, `car.jpg`
  reports `signingCredential.trusted` and reads `verified_trusted`. This proves the
  engine applies `trust.trustAnchors` and parsed the whole production string. The
  control certificate is not shipped.
- **No sample changes state with the production list.** All five still report
  `signingCredential.untrusted`. Their signing chains (Adobe Product Services
  G3/G4 → Adobe Root CA G2; Truepic WebClaimSigningCA for OpenAI/Sora) and their
  timestamp chains (DigiCert Trusted G4 TimeStamping) are not on either official
  list. Checked by comparing every certificate embedded in the samples with the
  55 listed certificates: 0 identical certificates, and 0 embedded certificates
  whose issuer name matches a listed certificate. `crater-lake.jpg` embeds no
  certificates because its manifest is remote. The list does contain one Adobe
  CA, "Adobe Product Issuing CA vault-a-or2.adobe.net cai", but none of the
  samples chain to it. This is the real outcome, so the configuration was not
  tuned to make any sample "trusted". (Handover rule 9: do not fake results.)

## Consequences and stated deviations

- **Signers become trusted only if they are on the official list.** A signer is
  trusted only when its chain leads to a CA on the official C2PA Trust List; the
  control shows that path reaches `verified_trusted`.
- **Current samples stay "Unverified".** The test bench and gallery samples are
  signed by Adobe and OpenAI chains outside the official list. So for them the
  page still shows the neutral badge, and "Verified", "Verified · Edited" and
  "AI-Edited" stay unreachable. A genuinely trusted sample would need content
  signed under a listed CA. That is **not evidenced** with the current corpus.
- **Not real-time validation.** The list is as current as the release that ships
  it. Report the enhanced-level item "dynamic trust-list validation" as **partly
  met, with this deviation stated**, not as met.
- **TSA list:** both lists are given to the engine in one anchor set, because
  c2pa-web 0.13.1 exposes no separate TSA trust setting (`TrustSettings` has only
  `userAnchors`, `trustAnchors`, `trustConfig` and `allowedList`). Whether a
  timestamp from a listed TSA is treated as trusted is **not evidenced**, because
  no sample's timestamp comes from a listed TSA.
- **No revocation checking** (OCSP/CRL). The engine-level runs show no OCSP
  requests.
- **Test-only anchors:** none were added to the product. Adding a clearly labelled
  test-only anchor to the test bench is a team decision (Jonah) and would need to
  stay out of the production bundle.

## For Jonah to review (trust-model owner)

1. The source choice: the official Conformance Program lists, not the
   superseded Interim Trust List. Also the pinned commit and the update procedure.
2. Whether TSA certificates should sit in the same anchor set. That is the only
   option the 0.13.1 settings offer.
3. The honest outcome that no current sample is trusted, and whether the team
   wants a test-only anchor for the test bench. If so, it needs a separate decision
   and must stay out of the production bundle.
4. The control method in `tests/engine/run.mjs`, which uses a CA certificate from
   the asset's own chain.
5. The CAWG identity DID fetch found in the "before" run
   (`connected-identities.identity.adobe.com`). It belongs to the trust layer and
   is handled with the remote-manifest fix.
6. Corrections owed in `docs/phase2/trust-list-handover-notes.md`. Its diagnosis
   of "missing intermediate certificates" should say that no anchors were
   configured at all. This will be handled in the docs-corrections PR.
