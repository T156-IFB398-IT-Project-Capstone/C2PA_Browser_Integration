# Performance run — 2026-10-07

Latency and JS-heap measurements of the real extension pipeline
(content-script detection → service-worker fetch → offscreen WASM verify →
result) on `main` after PR #23 (MP4 badge integration). Every number below is
printed by `node perf/analyze.mjs perf/results/2026-10-07` from the raw logs in
`raw/`; nothing is estimated. `results.json` holds the same figures in full.

## Headline (medians of n = 3 runs)

| Scenario | Result |
|---|---|
| Single image, cold (first scan after extension reload) | **87 ms** detect→result, 22.6 ms verify-only |
| Single image, warm (repeat scan) | **85 ms** detect→result, 16.1 ms verify-only |
| 100-item page | **10.7 s** total, **245.5 ms** median per-item service time (p95 579 ms), 107.1 ms amortised per item |
| 100-item page JS heap (offscreen document) | **31.08 → 67.48 MB**, largest sampled value 229.96 MB |

## Environment

| | |
|---|---|
| Commit | `654a59dc5936779bfc2599720040452ac14b60c1` (`main`, PR #23 merged) |
| c2pa-web | 0.13.1 (`package-lock.json`) |
| Chrome | 154.0.8037.98 (Official Build, 64-bit, Stable), V8 15.4.80.20 |
| Chrome flags | fresh profile `--user-data-dir=%TEMP%\c2pa-perf-profile --no-first-run --enable-precise-memory-info` |
| Extension load | Load unpacked via `chrome://extensions` (Chrome 137+ ignores `--load-extension`) |
| OS | Windows 11 Home 24H2, build 26100, 64-bit |
| CPU / RAM | Intel Core i7-10750H @ 2.60 GHz, 6 cores / 12 threads; 15.8 GB |
| Server | `docs/phase2/performance-harness-evidence/perf-server.mjs`, 127.0.0.1:8975 |
| Scan concurrency | `SCAN_CONCURRENCY = 3` |

## Asset mix

- **Single item:** `single-image.html` — one `car.jpg` (580,124 bytes, Adobe
  Photoshop manifest), result `verified_tsa` in every run.
- **100-item page:** `heavy-page.html` — 90 images cycling six fixtures (15
  each) and 10 videos (5 × `sora.mp4`, 5,278,370 bytes; 5 × `unsigned.mp4`, 148
  bytes). Each item has a distinct `?i=N` query string so the HTTP cache does
  not collapse repeats. Results, identical in all three runs:

  | Fixture | Status |
  |---|---|
  | car.jpg, Firefly-cat.jpg, crater-lake.jpg | `verified_tsa` (45) |
  | ChatGPTgen.png, cloudscape.jpeg, sora.mp4 | `invalid_or_changed` (35) |
  | earth_apollo17.jpg, unsigned.mp4 | `no_credentials` (20) |

## Method

1. `npm run build`; harness server started; extension loaded unpacked into the
   fresh profile above.
2. **Cold run:** reload the extension on `chrome://extensions`, clear
   `c2pa.perf_log`, reload the test page, click *Scan this page*. The reload
   gives a new offscreen document, so the c2pa-web SDK is created during this
   scan.
3. **Warm run:** a second *Scan this page* straight after a cold run, with no
   reload.
4. **100-item run:** same reset as a cold run, then scan `heavy-page.html` to
   100/100. Each heavy run therefore includes SDK start-up on its first item.
5. After each run the service worker's `c2pa.perf_log` was copied from its
   DevTools console into `raw/<scenario>-run<N>.json` and the log cleared, so
   each file holds exactly one run. Steps are in
   `docs/phase2/performance-harness-evidence/README.md`.
6. Order: cold/warm pairs 1–3, then heavy 1–3. Cold run 1 was re-taken last
   (see *First scan after install*).

**Metric definitions** (all from the in-pipeline instrumentation):

- *detect→result* (`totalLatencyMs`): `discoverMedia()` stamp, taken when the
  scan starts, to result in the service worker. Wall clock (`Date.now()`), ms
  resolution. For one item it is also the total scan time.
- *verify-only* (`wasmVerifyMs`): `fromBlob()` + `manifestStore()` in the
  offscreen document.
- *service time*: `resultAt − verifyStartedAt` per item (fetch + message +
  verify, excluding queue wait).
- *100-item total*: last `resultAt` − detection stamp.
- *heap*: `performance.memory.usedJSHeapSize` in the offscreen document,
  sampled immediately before and after each `verify()`. *Before* is the first
  item's before-sample, *after* is the last item's after-sample, *largest
  sampled* is the maximum of all 200 samples.
- *p95*: nearest-rank. Medians in the tables are the median of the three
  per-run values.

## Results

### Single item — cold

| Metric | Run 1 | Run 2 | Run 3 | **Median** |
|---|---:|---:|---:|---:|
| detect→result (ms) | 85 | 87 | 87 | **87** |
| verify-only (ms) | 16 | 23.3 | 22.6 | **22.6** |
| total (ms) | 85 | 87 | 87 | **87** |
| fetch (ms) | 6.3 | 7.6 | 7.8 | **7.6** |
| message round trip (ms) | 76 | 78.6 | 76 | **76** |
| heap before (MB) | 26.98 | 27.44 | 27.2 | **27.2** |
| heap after (MB) | 31.12 | 27.1 | 27.1 | **27.1** |
| heap peak | not measured | | | |

### Single item — warm

| Metric | Run 1 | Run 2 | Run 3 | **Median** |
|---|---:|---:|---:|---:|
| detect→result (ms) | 78 | 89 | 85 | **85** |
| verify-only (ms) | 17.3 | 16.1 | 14.7 | **16.1** |
| total (ms) | 78 | 89 | 85 | **85** |
| fetch (ms) | 7.6 | 7.5 | 6.7 | **7.5** |
| message round trip (ms) | 67.3 | 81 | 77 | **77** |
| heap before (MB) | 26.97 | 31.05 | 31.34 | **31.05** |
| heap after (MB) | 31.11 | 31.09 | 24.88 | **31.09** |
| heap peak | not measured | | | |

Heap peak is not measured for one item: only the before/after samples exist.

### First scan after install (n = 1, kept separate)

The very first scan after loading the extension into the fresh profile, taken
before the cold/warm series (`raw/single-firstload-after-install.json`):
**230 ms** detect→result, 81.4 ms verify-only, 221 ms message round trip,
heap 42.72 → 42.76 MB. Cold runs after a reload took 85–87 ms, which
suggests this extra start-up cost is paid on first install rather than on
every reload. Why is not
established; one untested explanation is Chrome reusing compiled WebAssembly.
With n = 1 it is an observation, not a result.

### 100-item page

| Metric | Run 1 | Run 2 | Run 3 | **Median** |
|---|---:|---:|---:|---:|
| items logged | 100 | 100 | 100 | **100** |
| total (ms) | 10708 | 10266 | 11028 | **10708** |
| amortised per item (ms) | 107.1 | 102.7 | 110.3 | **107.1** |
| detect→result median (ms) | 4379.5 | 4264.5 | 4608 | **4379.5** |
| detect→result p95 (ms) | 9266 | 8927 | 9682 | **9266** |
| service time median (ms) | 245.5 | 235 | 252 | **245.5** |
| service time p95 (ms) | 579 | 531 | 627 | **579** |
| verify-only median (ms) | 45.3 | 38.5 | 47.3 | **45.3** |
| verify-only p95 (ms) | 255.8 | 240.7 | 274.1 | **255.8** |
| fetch median (ms) | 12.6 | 10.7 | 11.7 | **11.7** |
| observed max concurrency | 3 | 3 | 3 | **3** |
| cache hits | not measured | | | |
| heap before (MB) | 31.08 | 26.94 | 31.09 | **31.08** |
| heap largest sampled (MB) | 209.75 | 229.96 | 264.58 | **229.96** |
| heap after (MB) | 57.37 | 229.96 | 67.48 | **67.48** |

detect→result for the 100-item page includes time queued behind the
3-at-a-time limit, so it grows with the item's position in the queue. Service
time is the per-item cost. Observed concurrency is the most overlapping
`[verifyStartedAt, resultAt]` intervals, and it matches the configured limit.

By kind (per run):

| Run | Kind | Items | Service median (ms) | Verify-only median / p95 (ms) | Message overhead median (ms) | Fetch median (ms) |
|---|---|---:|---:|---:|---:|---:|
| 1 | image | 90 | 239.5 | 25.4 / 256.5 | 128.4 | 12.6 |
| 1 | video | 10 | 729.5 | 51.6 / 63.3 | 522.2 | 26.4 |
| 2 | image | 90 | 224 | 38.5 / 241.4 | 145.9 | 10.6 |
| 2 | video | 10 | 685 | 67.8 / 136.6 | 455.1 | 21.8 |
| 3 | image | 90 | 245.5 | 32.5 / 278.8 | 138.8 | 11.2 |
| 3 | video | 10 | 704.5 | 49.4 / 66.9 | 505.1 | 40 |

*Message overhead* is round trip minus verify-only.

## Observations

- **Message passing dominates per-item cost, not WASM verification.** For
  video, the median message overhead is 455–522 ms against 49–68 ms
  verify-only. `service-worker.js` sends the bytes as
  `Array.from(bytes)` (a plain number array, because `chrome.runtime`
  messages are JSON-serialised). A 5.3 MB video becomes a 5.3-million-element
  array. This is the most likely lever if scan time needs to drop. It is not
  changed here.
- **The JS heap swings widely during a 100-item scan** (largest samples
  209.75–264.58 MB, from about 27–31 MB at the start). The same number-array
  transfer is a likely contributor, but this run does not prove it.
- **Leak question (`reader.free()`): not answered by this run.** Median
  heap-after per quarter of the scan was 56.67 / 68.05 / 80.44 / 63.13 MB
  (run 1), 58.46 / 84.38 / 80.48 / 77.55 (run 2) and 56.74 / 68.09 / 80.48 /
  104.38 (run 3). All 10 videos finish in positions 90–100, so the last
  quarter is confounded by item size. GC timing also moves the readings (run
  2 ended at 229.96 MB, runs 1 and 3 at 57.37 and 67.48 MB). Any leak from an
  unfreed reader would sit in WASM memory, which `performance.memory` cannot
  see (next section).
- **ChatGPTgen.png is `invalid_or_changed` in the live pipeline** (15/15 in
  each run), while `scripts/test-status-mapping.mjs` expects
  `verified_untrusted` for its pre-extracted manifest. The two paths disagree.
  This is not investigated here; the status logic is owned by the result-model
  and trust-model leads.

## Limitations

- **`performance.memory` excludes WASM linear memory.** It reports the
  offscreen document's JS heap only, so the c2pa-web engine's own memory is
  not in these figures. It is not OS process memory either.
- **`reader.free()` status: not called.** `offscreen.js` creates the reader
  with `c2pa.reader.fromBlob()` (line 88) and never frees it. Whether that
  leaks WASM memory cannot be seen with this instrumentation.
- **Heap peak is sampled, not true.** One item gives two samples, so peak is
  not measured; the 100-item figure is the largest of 200 samples.
- **Cache hits: not measured.** The manual scan calls `verifyOne(url, true)`
  (`bypassCache`), and only the manual scan writes `c2pa.perf_log`, so hits are
  0 by design. The realtime path that uses the cache is not instrumented.
- **Localhost fetch.** Fetch times (medians 6.3–40 ms) exclude real network
  latency.
- **n = 3, one machine, human-driven.** The gaps between runs varied. GC
  timing is uncontrolled. The instrumentation's own overhead is not
  quantified. Wall-clock fields have 1 ms resolution.
- **Cold means first scan after a reload**, not first scan after install (see
  above). Heavy runs start cold, so their first item includes SDK start-up.
- **Excluded data.** In a first attempt, one 100-item log was pasted into the
  same file as cold run 1. That heavy log was later overwritten and is not in
  this folder. It was replaced by the three heavy runs above. Its cold entry
  is kept as `raw/single-firstload-after-install.json`.

## Reproduce

```cmd
npm ci && npm run build
node docs/phase2/performance-harness-evidence/perf-server.mjs
:: load the extension and capture the runs as in the harness README, then:
node perf/analyze.mjs perf/results/2026-10-07
```
