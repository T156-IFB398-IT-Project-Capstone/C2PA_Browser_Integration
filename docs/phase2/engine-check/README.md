# Engine-level check — evidence

Each folder is one run of `node tests/engine/run.mjs` (see `tests/engine/README.md`):
the extension's real verifier (c2pa-web 0.13.1 with the extension's
`ENGINE_SETTINGS`) in headless Chrome over the five samples in
`test-assets/trusted/`. `README.md` in each folder is the generated summary;
`results.json` holds the full data, including the raw SDK validation result per
asset and every recorded network request.

| Run | Engine settings | Folder |
|---|---|---|
| Before the QA fixes (19 Oct 2026, commit `3ab97f5`) | `cawgTrust.verifyTrustList: true` only (as shipped since PR #11) | [`before/`](before/README.md) |

## What the "before" run shows

Evidence: [`before/README.md`](before/README.md), all four harness checks PASS or N/A
(network capture of worker requests confirmed by the self-test).

| Asset | Final state | SDK result (key codes) | Outbound requests during verification |
|---|---|---|---|
| `car.jpg` | `verified_tsa` | Valid; `signingCredential.untrusted`, `timeStamp.trusted` | none |
| `ChatGPTgen.png` | `invalid_or_changed` | Invalid; `signingCredential.expired`, `signingCredential.untrusted`, no timestamp | none |
| `crater-lake.jpg` | `verified_tsa` | Valid; `signingCredential.untrusted`, `timeStamp.trusted` | `cai-manifests.adobe.com/manifests/urn-uuid-…` (HTTP 200) |
| `cloudscape.jpeg` | `invalid_or_changed` | Invalid; `signingCredential.expired`, `signingCredential.untrusted`, `timeStamp.untrusted` (informational), `cawg.ica.credential_valid` | `connected-identities.identity.adobe.com/.well-known/did.json` (HTTP 200) |
| `sora.MP4` | `invalid_or_changed` | Invalid; `signingCredential.expired`, `signingCredential.untrusted`, `timeStamp.untrusted` (informational) | none |

1. **No C2PA signer is trusted (risk R20 confirmed at engine level).** Every
   asset reports `signingCredential.untrusted`; no `trust.trustAnchors` are
   configured. `cawgTrust.verifyTrustList` concerns CAWG identity assertions only.
2. **Remote manifest fetched (risk R21 confirmed).** Verifying `crater-lake.jpg`
   made a request to Adobe's manifest service from the engine's Web Worker.
3. **A second outbound request, not previously recorded.** Verifying
   `cloudscape.jpeg` fetched a DID document from
   `connected-identities.identity.adobe.com` while validating its CAWG identity
   assertion (`cawg.ica.credential_valid`). This is separate from remote-manifest
   fetching, so turning that setting off may not stop it; to be tested with the
   remote-manifest fix.
4. **Expired certificates.** `ChatGPTgen.png` reads `invalid_or_changed` because
   its signing certificate is reported expired and it carries no timestamp.
   (`scripts/test-status-mapping.mjs` expects `verified_untrusted` for this asset
   from a pre-extracted manifest; the engine today reports
   `signingCredential.expired`.) `cloudscape.jpeg` and `sora.MP4` have timestamps
   from authorities the engine does not trust (`timeStamp.untrusted`), so their
   expired certificates are not rescued (finding-001).
5. `car.jpg` reads `verified_tsa`, matching the 7 Oct performance run.
