# Engine-level check

`npm test` replaces c2pa-web with a stand-in (`tests/unit/helpers/fake-c2pa-web.mjs`),
so it cannot show what the real engine does with the extension's settings. This
harness runs the **real** verifier — `verifyDetailed()` from
`extension/src/offscreen/offscreen.js`, i.e. c2pa-web 0.13.1 with the extension's
`ENGINE_SETTINGS` — in headless Chrome over the sample assets in
`test-assets/trusted/`, and records for each asset:

- the final state the extension would show (`VERIFY_STATUS`),
- the raw SDK validation result (`validation_state`, `validation_status`, `validation_results`),
- every network request made while that asset was being verified, from the page
  **and from every Web Worker** (c2pa-web verifies inside a worker).

## Run

```bash
npm ci && npm run build          # once; the harness reuses node_modules
node tests/engine/run.mjs --out docs/phase2/engine-check/<label>
# or: npm run engine-check -- --out docs/phase2/engine-check/<label>
```

Needs Chrome installed (found automatically on Windows, macOS and Linux; otherwise
`--chrome <path>` or `CHROME_PATH`). No extra dependency: Node built-ins (Node 22+
for the built-in WebSocket), the repo's esbuild, and the Chrome DevTools Protocol.
Writes `results.json` (full data) and `README.md` (summary) to the `--out` folder.
Exit code 0 = all checks passed or N/A, 1 = a check failed, 2 = harness error.

The run makes real network requests if the engine does (that is what it measures):
with the SDK defaults, `crater-lake.jpg` fetches its manifest from Adobe's manifest
service and `cloudscape.jpeg` fetches a DID document from Adobe.

## Checks

| Check | Fails when |
|---|---|
| `network-capture-self-test` | A fetch from a Web Worker to a reserved `.invalid` host is not recorded. Without this, "no requests recorded" would prove nothing. |
| `engine-settings-applied` | `createC2pa()` rejected `ENGINE_SETTINGS` and the engine runs with SDK defaults. |
| `trust-anchors` | Anchors are configured but are not ONE PEM string (the SDK fetches URLs and every array item), or no asset reports `signingCredential.trusted` — i.e. the anchors are not active. N/A when no anchors are configured. |
| `remote-manifests-local` | `verify.remoteManifestFetch` is `false` but an outbound request happened during engine initialisation or any verification. N/A when the setting is not `false`. |

## How it works

`run.mjs` bundles `harness-entry.mjs` with esbuild (same loader and defines as the
offscreen entry in `build.mjs`), serves it with `harness.html` and the assets on
127.0.0.1, launches Chrome with a throwaway profile under `tests/engine/.tmp/`
(git-ignored, deleted after the run), and drives it over the DevTools Protocol.
Phases run one at a time (engine init, capture self-test, then load + verify per
asset), so each recorded request is attributed to the phase that made it. Asset
bytes are loaded from 127.0.0.1 before the verify phase starts.

## Evidence

Results are committed under `docs/phase2/engine-check/`, one folder per run.
