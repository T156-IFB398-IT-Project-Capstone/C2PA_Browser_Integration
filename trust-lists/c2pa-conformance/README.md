# Official C2PA trust lists (bundled trust anchors)

These two files are the **C2PA Trust List** (claim-signing CAs) and the **C2PA TSA
Trust List** (time-stamping authorities) published by the C2PA Conformance Program
in [`c2pa-org/conformance-public`](https://github.com/c2pa-org/conformance-public)
(`trust-list/`), licensed CC-BY-4.0. They are copied byte-for-byte; provenance
(commit, retrieval time, SHA-256, git blob ids) is in [`SOURCE.json`](SOURCE.json)
and the decision is recorded in
[`docs/phase2/decisions/2026-10-19-trust-anchors.md`](../../docs/phase2/decisions/2026-10-19-trust-anchors.md).

How they are used: `extension/src/offscreen/offscreen.js` imports both files at
build time (esbuild text loader), joins them into **one PEM string** and passes it
to c2pa-web as `trust.trustAnchors`. Nothing is fetched at verification time. The
list is therefore as current as the release that ships it — it is **not** live,
real-time trust-list validation, and there is no revocation (OCSP/CRL) checking.

Contents are public certificates only (no private keys).

## Updating (with each release)

1. Find the latest commit touching `trust-list/` in `c2pa-org/conformance-public`.
2. Download both `.pem` files from `raw.githubusercontent.com/c2pa-org/conformance-public/<commit>/trust-list/`.
3. Check `git hash-object <file>` equals the blob id GitHub reports for that path, and
   record commit, retrieval time, sizes, certificate counts and SHA-256 in `SOURCE.json`.
4. `npm test` (checks the files against `SOURCE.json`), then
   `node tests/engine/run.mjs --out docs/phase2/engine-check/<label>` and review
   which samples change state.
5. Commit through a PR; note the change in the release notes.

`.gitattributes` disables line-ending conversion for these files so their hashes stay stable.
