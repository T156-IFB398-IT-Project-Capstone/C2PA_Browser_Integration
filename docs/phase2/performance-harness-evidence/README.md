# Sprint 3 performance harness — latency & memory

Measures the real extension pipeline (content-script detection → service-worker
fetch → offscreen WASM verify → result), not an isolated SDK harness — unlike
SPIKE-001's `perf-harness.html`/`.js` (kept as historical record, not touched
or reused directly here). Instrumentation lives permanently in the pipeline
(`content-script.js`, `service-worker.js`, `offscreen.js`), not a throwaway
diagnostic — it's meant to be re-run by anyone on the team in later sprints.

## What it measures, per verified item

| Field | Meaning | Caveats |
|---|---|---|
| `totalLatencyMs` | detection (content-script) → result populated (service worker) | Cross-context, uses `Date.now()` (wall clock) — see "Why two clocks" below |
| `fetchMs` | byte fetch time, inside `fetchAsBytes()` | Single-context (`performance.now()`), localhost-only in this harness — not representative of a real network fetch |
| `messageRoundTripMs` | `chrome.runtime.sendMessage` to offscreen, round trip | Includes `wasmVerifyMs` plus message-passing overhead — subtract to isolate the overhead |
| `wasmVerifyMs` | `fromBlob()` + `manifestStore()` only, inside the offscreen document | Matches SPIKE-001's "verify-only" definition (excludes SDK cold-start and fetch) |
| `heapBeforeBytes` / `heapAfterBytes` / `heapDeltaBytes` | `performance.memory.usedJSHeapSize`, offscreen document, immediately before/after `verify()` | **Chrome-only, approximate. Does not include WASM linear memory** — understates the true footprint of the c2pa-web engine itself. Same caveat SPIKE-001 already documented. JS-heap only, not OS-level process memory. |
| `byteLength` | verified asset size | — |

**Why two clocks:** `performance.now()` has a different time origin per JS
context (service worker vs. offscreen document) — subtracting timestamps
across contexts is invalid. `totalLatencyMs` spans content-script → service
worker, so it uses `Date.now()` (wall clock, comparable across contexts).
`fetchMs`/`messageRoundTripMs`/`wasmVerifyMs` are each computed entirely
within one context, so `performance.now()` is valid and more precise there.

**Known measurement risk:** the instrumentation itself (a `performance.now()`
call, a heap read, an array push) is cheap relative to fetch/WASM-verify
time (hundreds of ms, per SPIKE-001's own figures) — overhead is not expected
to meaningfully skew results, but hasn't been separately quantified. If
`wasmVerifyMs` figures look suspiciously different from SPIKE-001's isolated
harness numbers for the same asset, this is the first thing to check.

**Known pipeline issue this harness may surface, not fix:** `offscreen.js`
never calls `reader.free()` on the WASM-side reader object (SPIKE-001's own
harness did). If `heapDeltaBytes` trends upward across the 100+-item scan
rather than staying flat, that's evidence of a real leak — worth a separate
fix, out of scope for this measurement task.

## How to run it

1. `node build.mjs` from the repo root (picks up the instrumented
   `service-worker.js`/`offscreen.js`).
2. `node docs/phase2/performance-harness-evidence/perf-server.mjs` — serves
   `http://127.0.0.1:8975/{single-image,single-video,heavy-page}.html`.
3. Load the unpacked extension **manually** (`chrome://extensions` →
   Developer mode → Load unpacked → `extension/`, the folder holding
   `manifest.json`). Do not rely on `--load-extension`: Chrome 137+ ignores
   that flag in branded Google Chrome builds, so a launch that passes it
   silently starts without the extension (SPIKE-001 "Run 2" hit this
   symptom). Use a throwaway profile so other extensions and cached state
   don't skew results:
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%TEMP%\c2pa-perf-profile" --no-first-run --enable-precise-memory-info
   ```
   `--enable-precise-memory-info` stops Chrome quantising
   `performance.memory`; without it, heap readings are coarse buckets.
4. Navigate to each scenario page, open the popup, click "Scan this page".
   Wait for the scan to finish (`heavy-page.html` will take noticeably
   longer — 100 items, `SCAN_CONCURRENCY = 3`).
5. Retrieve the accumulated log from the service worker's own DevTools
   console (`chrome://extensions` → the extension card → "service worker"
   link):
   ```js
   l = JSON.stringify((await chrome.storage.local.get('c2pa.perf_log'))['c2pa.perf_log'] ?? []); JSON.parse(l).length
   ```
   prints the entry count, then, as a **separate** command on its own line:
   ```js
   copy(l)
   ```
   `copy()` is a Chrome DevTools console helper — puts the JSON on the
   clipboard (it prints `undefined` on success). It is only defined in a
   plain top-level command: inside a `.then()` callback, or on the same line
   as an `await`, it fails with `ReferenceError: copy is not defined`. Paste it into `perf/results/<date>/raw/<scenario>-run<N>.json`
   (`single-cold`, `single-warm` or `heavy`), then run
   `node perf/analyze.mjs perf/results/<date>` to produce `results.json`.
6. To reset between runs (so `heavy-page.html`'s 100 entries don't mix
   with the single-item runs in the same log): `chrome.storage.local.remove('c2pa.perf_log')`
   in the same console, before starting the next run.

**Cold vs warm.** The offscreen document creates the c2pa-web SDK lazily, on
the first verification after the extension starts. A *cold* run is the first
scan after reloading the extension on `chrome://extensions` (SDK start-up
lands in that item's `messageRoundTripMs`, not `wasmVerifyMs`). A *warm* run
is a further scan with no reload in between.

## Regenerating the heavy test page

`generate-heavy-page.mjs` produced the committed `heavy-page.html` (90 images
+ 10 videos, 100 items total, each fixture repeated under a distinct `?i=N`
query string so neither the browser's HTTP cache nor a real CDN's caching
collapses repeats into one fetch). Only re-run it if the item mix needs to
change — the output is committed and versioned, not regenerated per run.

## Scope note

This is a standalone local page (`docs/phase2/performance-harness-evidence/`),
deliberately kept separate from `c2pa-test-bench/` (Jonah's hosted test
bench) rather than added to it — confirmed via `git log` that only Jonah has
touched that folder to date.
