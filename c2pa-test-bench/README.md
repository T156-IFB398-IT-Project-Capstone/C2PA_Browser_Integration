# C2PA Test Bench

A static demo page for exercising C2PA verification against a small fixed
set of reference assets (`assets/`) and any file you drop in. Runs entirely
client-side — no server needed beyond a plain static file host (or opening
`index.html` directly).

## Live verification, not a mock

`app.js` calls into the **real, unmodified** verifier from
`extension/src/offscreen/offscreen.js` — the same code the browser extension
runs — via a small bundled entry point. Nothing here reimplements
verification logic; a change to `offscreen.js`'s `verify()` flows through to
this page automatically the next time the bundle is rebuilt.

- `verify-entry.mjs` — the bundler entry: imports `verify()` from
  `extension/src/offscreen/offscreen.js` and `SUPPORTED_MIME_TYPES` from
  `extension/src/shared/constants.js`, exposes them as `window.C2PAVerify`
  and `window.SUPPORTED_MIME_TYPES`.
- `build.mjs` — esbuild config bundling `verify-entry.mjs` into
  `verify-bundle.js` (gitignored — regenerate, don't commit; it embeds the
  WASM binary as base64, ~11 MB).
- `index.html` loads `verify-bundle.js` (as a module) before `app.js` (a
  classic script — kept that way so its inline `onclick="..."` handlers and
  global function scope keep working unchanged).

## Building

From the repo root (relies on Node's upward `node_modules` resolution —
this directory deliberately has no `package.json` of its own):

```
node c2pa-test-bench/build.mjs
```

Re-run this whenever `offscreen.js`, its dependencies, or `verify-entry.mjs`
change. `app.js`/`index.html`/`style.css` need no build step — edit and
reload.

## Running

Open `index.html` directly in a browser, or serve the directory with any
static file server. No extension installation needed — this is a plain web
page, not part of the Chromium extension.

- The 9 reference cards under `assets/` verify live on page load (real
  `fetch()` + `verify()` per asset — the WASM SDK's cold-start adds brief,
  real latency on the first call).
- Drag a file onto the upload zone (or use "Browse Files") to verify it
  live — image or MP4, signed or not. The result is whatever the real
  verifier returns; nothing is assumed or fabricated.

## Known gaps (by design, not bugs)

- **No SKI (Subject Key Identifier) extraction.** The real verifier's
  output (`extractManifest()` in `offscreen.js`) has no SKI field — the
  `ski` detail always reads `N/A`. Real SKI-based trust-list matching is
  separate, not-yet-built work (a different Sprint tracker item).
- **`checksum` display field** is a human-readable summary derived from the
  real `status`/`error` (e.g. `FAIL (certificate expired)`), not a literal
  cryptographic checksum — no such value exists in the real manifest shape
  either.
