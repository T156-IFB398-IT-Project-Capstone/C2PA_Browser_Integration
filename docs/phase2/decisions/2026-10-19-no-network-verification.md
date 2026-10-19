# Decision: no network access during verification

- **Date:** 19 October 2026
- **Decided by:** Lucas Mai (Technical Lead), 19 Oct 2026. Lucas confirmed the CAWG identity choice in chat. Jonah (trust layer) and Brian (UI wording) are to review, and Grace is informed of the result-model change.
- **Status:** Implemented on branch `feat/remote-manifests-off` (QA fix 2, risk R21)

## Context

CLAUDE.md constraint 3 says verification is local: no outbound request without a
recorded decision. The engine-level check
([`engine-check/before/`](../engine-check/before/README.md)) found **two** outbound
requests during verification with the SDK defaults:

| Asset | Request | Cause |
|---|---|---|
| `crater-lake.jpg` | `GET https://cai-manifests.adobe.com/manifests/urn-uuid-…` | The asset only links to its manifest, which Adobe's manifest service stores. The SDK follows remote-manifest links by default (R21, known since the 12 Oct QA). |
| `cloudscape.jpeg` | `GET https://connected-identities.identity.adobe.com/.well-known/did.json` | Validating the asset's CAWG identity assertion (`cawg.ica.credential_valid`) resolves a DID document online. Not previously recorded. |

So statements that verification is "fully local" were untrue for such assets.

## Decision

`ENGINE_SETTINGS` in `extension/src/offscreen/offscreen.js`:

1. **`verify.remoteManifestFetch: false`.** The engine does not fetch remote
   manifests. Instead it reports the link as
   `RemoteManifestUrl("https://…")`. `verifyDetailed()` maps that to a new neutral
   result state, `VERIFY_STATUS.REMOTE_NOT_CHECKED` (`remote_not_checked`). It is
   **not** an error, not "tampered" and not "no credentials".
   - This key is not declared in c2pa-web 0.13.1's TypeScript types. The SDK
     converts setting names to snake_case and passes them to c2pa-rs, whose WASM
     binary contains `remote_manifest_fetch`, and the engine-level check shows it is
     honoured.
2. **`core.decodeIdentityAssertions: false`.** CAWG identity assertions are no
   longer decoded or validated, so their DID lookup never runs.
   - Lucas chose this on 19 Oct over the alternative of keeping the request and
     recording it as accepted.
   - Impact: the extension never read CAWG identity results (no reference in
     `extension/src`), and no sample changes state.
   - `cawgTrust.verifyTrustList` stays set but has no effect while identity
     assertions are not decoded.
   - Not usable: `core.allowedNetworkHosts`, a host allow-list. c2pa-web 0.13.1's
     settings serialiser turns arrays into objects, and the engine then refuses
     to start (`BadParam("invalid type: map, expected a sequence")`, probe run on
     19 Oct).

### Result state and wording

This is a minimal UI change; Brian to review.

| Where | Wording |
|---|---|
| Status label (popup, detail page) | "Credentials stored online — not checked" |
| Popup note | "This image points to Content Credentials stored online. They were not checked, to keep your browsing private." |
| In-page badge | Same neutral icon as "Unverified", with its own label: "Credentials online — not checked" |
| In-page tooltip | "This image points to Content Credentials stored online. They were not checked, to keep your browsing private." |
| "More detail", trust status | "The Content Credentials are stored online and were not checked, to keep your browsing private." |
| Popup Shield (`badge-map.js`) | No Shield, because nothing was checked |

The page shows a neutral badge rather than nothing. The reason: the image does
carry a credentials link, and the user can see why it was not checked. Brian may
change this to "no badge", which is a one-line change in `pickBadge()`.

Grace: the result model gains one status. Unit tests are updated: status labels,
the `determineStatus` coverage list, verify mapping, and settings.

Jonah: the test bench's own label table in `c2pa-test-bench/app.js` has no entry for
`remote_not_checked`, so it will show the raw status string. That file was not
changed (test-bench owner).

## Evidence

From [`engine-check/after-remote-manifests/`](../engine-check/after-remote-manifests/README.md), commit `5036bfc`:

- `remote-manifests-local`: **PASS**.
  - No outbound request during engine initialisation or any verification.
  - The engine refused to fetch `crater-lake.jpg`'s manifest, and the result is
    `remote_not_checked`.
  - The network-capture self-test (a request from a Web Worker) passed in the same
    run, so "no requests recorded" is meaningful.
- `cloudscape.jpeg`: no request, state unchanged (`invalid_or_changed`).
- All other samples: states unchanged from the "after trust anchors" run.

## Consequences

- An asset whose credentials live only online cannot be verified by this
  extension. It shows as "not checked". That is the privacy trade-off, and
  Databench may choose differently in the built-in feature: re-enable the fetch
  only with a new recorded decision.
- CAWG identity (who the creator says they are, via an identity provider) is not
  checked. To restore it, Databench would need either offline DID resolution or an
  accepted network request, recorded as a decision.
- Revocation (OCSP/CRL) is not checked. The runs show no OCSP request.
