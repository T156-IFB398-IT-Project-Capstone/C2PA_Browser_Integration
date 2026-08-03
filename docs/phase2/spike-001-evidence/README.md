# SPIKE-001 evidence — plain-page harness ("Run 1") and Q4 perf harness

**This is spike evidence, not product code.** These are the harnesses that
actually produced the Q1/Q2 (parsing/validation) and Q4 (wall-clock/memory)
results recorded in `docs/phase2/spike-001-mp4-verification.md` §7 — kept
here, with their captured raw output, so the run is reproducible and not
just asserted. Not referenced by `build.mjs`, `package.json`, or anything
shipped.

Per the spike's own method (§4, item 1): these harnesses drive `c2pa-web`
directly, isolated from the extension entirely — no `chrome.*` APIs, no
message passing, no offscreen document. That isolation is what makes a
failure here a fact about the SDK rather than something the extension's
plumbing could be masking or mimicking. (The companion offscreen-document
harness, which drives the *extension's* real code, lives in
`extension/_spike-harness/` — necessarily inside `extension/` so it shares
the extension's origin.)

## Files

| File | Purpose |
|---|---|
| `harness-server.mjs` | Node built-ins only (`node:http`/`fs`/`path`), no new dependency. Serves `node_modules` (so a harness page can `import` `c2pa-web` as a real ESM module), the two MP4 fixtures under `/assets/`, and collects `POST /report` bodies to `results.json`. Its Content-Type lookup is **deliberately naive** (no case-folding) — see the "Methodology note" in the spike findings doc for why that mattered. |
| `make-unsigned-mp4.mjs` | Synthesizes `unsigned-no-manifest.mp4` (148 bytes: `ftyp`+`moov[mvhd]`+`mdat`, no C2PA data) — the V2 negative control. Not `ffmpeg`/`c2patool` output, per team decision not to install either. |
| `unsigned-no-manifest.mp4` | Output of the above, committed so the negative control is reproducible without re-running the generator. |
| `plain-harness.html` / `.js` | Run 1 (Q1/Q2). Imports `c2pa-web` directly, runs V1 (`sora.MP4`) through three MIME variants plus V2, POSTs each raw result. |
| `perf-harness.html` / `.js` | Q4. Times `createC2pa()`, `fetch`, `fromBlob`, `manifestStore`, `free` individually on V1, and samples `performance.memory`. |
| `bundle.mjs` | Regenerates `plain-harness.bundle.js` and `perf-harness.bundle.js` using the project's existing `esbuild` devDependency (no new dependency) — needed because `@contentauth/c2pa-web`'s dist ships an unresolved bare specifier (`"highgain"`) a browser can't resolve unbundled. |
| `*.bundle.js` | Generated, **gitignored** (each embeds the WASM binary as base64, ~10 MB). Run `node docs/phase2/spike-001-evidence/bundle.mjs`. |
| `results-q1-q2-run.json` | Actual captured output from the Run 1 pass that produced Outcome A — the exact JSON pasted into the findings doc. |
| `results-q4-perf-run.json` | Actual captured output from the Q4 timing/memory pass. |

## How to reproduce

```sh
node docs/phase2/spike-001-evidence/bundle.mjs
node docs/phase2/spike-001-evidence/harness-server.mjs
# separately, point a real Chrome instance (headless or not) at:
#   http://127.0.0.1:8973/plain-harness.html   (Q1/Q2)
#   http://127.0.0.1:8973/perf-harness.html    (Q4)
# results land in docs/phase2/spike-001-evidence/results.json as the run progresses
```

Both pages are ordinary web pages — opening them in any browser tab (not
just via automation) works identically; automation was only used here to
capture output without a human watching DevTools.
