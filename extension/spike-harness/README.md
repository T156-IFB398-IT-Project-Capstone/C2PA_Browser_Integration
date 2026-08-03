# SPIKE-001 evidence — offscreen-document harness ("Run 2")

**This is spike evidence, not product code.** It exists to demonstrate that
SPIKE-001's offscreen-document test run actually happened and to make it
reproducible — it is not part of the shipped extension, is not referenced by
`manifest.json` or `build.mjs`, and should not be treated as a pattern to
follow for real feature work.

Full write-up: `docs/phase2/spike-001-mp4-verification.md` §7, "Run 2
(offscreen document)". Short version: this harness is meant to drive the
real, unmodified `src/offscreen/offscreen.js` through its actual
`chrome.runtime.sendMessage(VERIFY_REQUEST)` contract — not a copy, not a
reimplementation — to test whether the SDK behaviour confirmed in isolation
(see `docs/phase2/spike-001-evidence/`) holds when exercised inside the real
offscreen-document execution context. As of this commit **it did not
complete**: navigating directly to any extension page (including the
unmodified `offscreen.html`) failed in this environment with
`Content verify job failed... reason:1` / `chrome-error://chromewebdata`,
in both headless and headed Chrome, on a machine reporting
"Your browser is managed by your organisation" in `chrome://extensions`.
That is recorded as an environment/tooling blocker, not an SDK finding.

## Files

| File | Purpose |
|---|---|
| `raw.js` / `raw.html` / `raw-early.js` | A page loaded at `chrome-extension://<id>/_spike-harness/raw.html`. Imports `c2pa-web` directly (not via `offscreen.js`) — tests whether extension-origin CSP/context alone changes SDK behaviour, independent of `offscreen.js`'s message-passing layer. `raw-early.js` is split out only because the extension's real CSP (`script-src 'self'`) disallows inline `<script>` blocks. |
| `send.js` / `send.html` | A page meant to be opened as a second tab alongside the real, unmodified `offscreen.html`. Sends the exact `VERIFY_REQUEST` message shape `service-worker.js` sends in production and reports the raw `{status, manifest, error}` response — i.e. drives the shipped code, not a copy of it. |
| `bundle.mjs` | Regenerates `raw.bundle.js` from `raw.js` using the project's existing `esbuild` devDependency (no new dependency). `@contentauth/c2pa-web`'s published dist ships an unresolved bare specifier (`import ... from "highgain"`) that a browser's native ES module loader can't resolve unbundled — see the "Methodology note" in `docs/phase2/spike-001-mp4-verification.md`. |
| `raw.bundle.js` | Generated, **gitignored** (embeds the WASM binary as base64, ~10 MB). Run `node extension/_spike-harness/bundle.mjs` to produce it. |

## How to finish Run 2 manually

1. `npm run build` (produces `extension/dist/`).
2. `node extension/_spike-harness/bundle.mjs`.
3. Load `extension/` unpacked at `chrome://extensions` (Developer mode →
   Load unpacked) — normal manual loading, not `--load-extension`, since
   that's the specific path that failed in automation.
4. Note the extension's ID.
5. Open `chrome-extension://<id>/src/offscreen/offscreen.html` in one tab —
   the real, unmodified file. Leave it open.
6. Start the report server: `node docs/phase2/spike-001-evidence/harness-server.mjs`
   (serves `/assets/*` and collects `POST /report`).
7. Open `chrome-extension://<id>/_spike-harness/send.html` in another tab —
   it will fetch the two fixtures from the report server, send them to
   whatever page currently holds the `VERIFY_REQUEST` listener (the
   offscreen.html tab from step 5), and POST the raw responses back.
8. Check `docs/phase2/spike-001-evidence/results.json` (or the server's
   stdout) for the captured output.
