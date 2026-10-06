// perf/analyze.mjs
// Turns raw performance-harness logs into results.json + Markdown tables.
//
// Usage:  node perf/analyze.mjs perf/results/<date>
//
// Expects <dir>/raw/ to hold:
//   environment.json                   — machine/build details, written by hand
//   single-cold-run<N>.json            — c2pa.perf_log after one cold scan
//   single-warm-run<N>.json            — c2pa.perf_log after one warm scan
//   heavy-run<N>.json                  — c2pa.perf_log after one heavy-page scan
// Each log file is the JSON array copied from the service worker console (see
// docs/phase2/performance-harness-evidence/README.md, step 5). Nothing is
// estimated: a value the log does not contain is written as null and listed
// under notMeasured. Zero dependencies (CLAUDE.md constraint #5).

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node perf/analyze.mjs perf/results/<date>');
  process.exit(1);
}
const rawDir = path.join(dir, 'raw');

const MB = 1024 * 1024;
const round = (v, dp = 1) => (v == null ? null : +v.toFixed(dp));
const toMB = (b) => (b == null ? null : round(b / MB, 2));

function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Nearest-rank p95: the smallest value with at least 95% of samples <= it.
function p95(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return v[Math.max(0, Math.ceil(0.95 * v.length) - 1)];
}

// Highest number of verifications in flight at once, from the service
// worker's own Date.now() stamps (same clock, so the intervals are comparable).
// An item finishing at t is counted as gone before one starting at t.
function maxOverlap(entries) {
  const events = [];
  for (const e of entries) {
    if (e.verifyStartedAt == null || e.resultAt == null) continue;
    events.push([e.verifyStartedAt, 1], [e.resultAt, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  for (const [, d] of events) { cur += d; max = Math.max(max, cur); }
  return events.length ? max : null;
}

function loadRuns(prefix) {
  if (!fs.existsSync(rawDir)) return [];
  return fs.readdirSync(rawDir)
    .filter((f) => f.startsWith(prefix) && /-run\d+\.json$/.test(f))
    .sort((a, b) => +a.match(/run(\d+)/)[1] - +b.match(/run(\d+)/)[1])
    .map((file) => {
      const entries = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
      if (!Array.isArray(entries)) throw new Error(`${file}: expected a JSON array (the c2pa.perf_log value)`);
      return { file, entries };
    });
}

function countBy(entries, key) {
  const out = {};
  for (const e of entries) out[e[key] ?? 'unknown'] = (out[e[key] ?? 'unknown'] ?? 0) + 1;
  return out;
}

function singleRun({ file, entries }) {
  if (entries.length !== 1) {
    throw new Error(`${file}: a single-item run should log exactly 1 entry, found ${entries.length} — clear c2pa.perf_log between runs`);
  }
  const e = entries[0];
  return {
    file,
    url: e.url,
    status: e.status,
    byteLength: e.byteLength,
    detectToResultMs: e.totalLatencyMs,
    verifyOnlyMs: e.wasmVerifyMs,
    // One item: the scan's total wall time and detect->result are the same span.
    totalMs: e.totalLatencyMs,
    fetchMs: e.fetchMs,
    messageRoundTripMs: e.messageRoundTripMs,
    heapBeforeMB: toMB(e.heapBeforeBytes),
    heapAfterMB: toMB(e.heapAfterBytes),
  };
}

function heavyRun({ file, entries }) {
  const byStart = [...entries].sort((a, b) => a.verifyStartedAt - b.verifyStartedAt);
  const byEnd = [...entries].sort((a, b) => a.resultAt - b.resultAt);
  const detectedAt = Math.min(...entries.map((e) => e.detectedAt ?? Infinity));
  const lastResultAt = Math.max(...entries.map((e) => e.resultAt));
  const totalMs = Number.isFinite(detectedAt) ? lastResultAt - detectedAt : null;
  const serviceMs = entries.map((e) => e.resultAt - e.verifyStartedAt);
  const heapSamples = entries.flatMap((e) => [e.heapBeforeBytes, e.heapAfterBytes]).filter((x) => x != null);

  const byKind = {};
  for (const kind of new Set(entries.map((e) => e.kind ?? 'unknown'))) {
    const ks = entries.filter((e) => (e.kind ?? 'unknown') === kind);
    byKind[kind] = {
      items: ks.length,
      serviceMedianMs: round(median(ks.map((e) => e.resultAt - e.verifyStartedAt))),
      verifyOnlyMedianMs: round(median(ks.map((e) => e.wasmVerifyMs))),
      verifyOnlyP95Ms: round(p95(ks.map((e) => e.wasmVerifyMs))),
      // Round trip minus verify-only: serialising the bytes as a number array,
      // message passing, and (first item only) SDK start-up.
      messageOverheadMedianMs: round(median(ks.map((e) => e.messageRoundTripMs - e.wasmVerifyMs))),
      fetchMedianMs: round(median(ks.map((e) => e.fetchMs))),
    };
  }

  // Heap trend: median heapAfter per quarter of the scan, in completion order.
  const q = byEnd.length / 4;
  const heapAfterByQuarterMB = [0, 1, 2, 3].map((i) =>
    toMB(median(byEnd.slice(Math.round(i * q), Math.round((i + 1) * q)).map((e) => e.heapAfterBytes))));

  return {
    file,
    itemsLogged: entries.length,
    statuses: countBy(entries, 'status'),
    totalMs,
    perItemAmortisedMs: totalMs == null ? null : round(totalMs / entries.length),
    detectToResultMedianMs: round(median(entries.map((e) => e.totalLatencyMs))),
    detectToResultP95Ms: round(p95(entries.map((e) => e.totalLatencyMs))),
    serviceMedianMs: round(median(serviceMs)),
    serviceP95Ms: round(p95(serviceMs)),
    verifyOnlyMedianMs: round(median(entries.map((e) => e.wasmVerifyMs))),
    verifyOnlyP95Ms: round(p95(entries.map((e) => e.wasmVerifyMs))),
    fetchMedianMs: round(median(entries.map((e) => e.fetchMs))),
    observedMaxConcurrency: maxOverlap(entries),
    heapBeforeMB: toMB(byStart[0]?.heapBeforeBytes),
    heapSampledMaxMB: heapSamples.length ? toMB(Math.max(...heapSamples)) : null,
    heapAfterMB: toMB(byEnd.at(-1)?.heapAfterBytes),
    heapAfterByQuarterMB,
    videoCompletionPositions: byEnd.flatMap((e, i) => (e.kind === 'video' ? [i + 1] : [])),
    byKind,
  };
}

function summarise(runs, keys) {
  const out = {};
  for (const k of keys) out[k] = round(median(runs.map((r) => r[k])), 2);
  return out;
}

const env = JSON.parse(fs.readFileSync(path.join(rawDir, 'environment.json'), 'utf8'));
const singleCold = loadRuns('single-cold').map(singleRun);
const singleWarm = loadRuns('single-warm').map(singleRun);
const heavy = loadRuns('heavy').map(heavyRun);

// Optional n=1 observation: the very first scan after loading the extension
// into a fresh profile. Kept apart from the cold runs (first scan after a
// reload), which are a different start-up condition.
const firstLoadFile = 'single-firstload-after-install.json';
const firstLoad = fs.existsSync(path.join(rawDir, firstLoadFile))
  ? singleRun({ file: firstLoadFile, entries: JSON.parse(fs.readFileSync(path.join(rawDir, firstLoadFile), 'utf8')) })
  : null;

const singleKeys = ['detectToResultMs', 'verifyOnlyMs', 'totalMs', 'fetchMs', 'messageRoundTripMs', 'heapBeforeMB', 'heapAfterMB'];
const heavyKeys = ['itemsLogged', 'totalMs', 'perItemAmortisedMs', 'detectToResultMedianMs', 'detectToResultP95Ms',
  'serviceMedianMs', 'serviceP95Ms', 'verifyOnlyMedianMs', 'verifyOnlyP95Ms', 'fetchMedianMs',
  'observedMaxConcurrency', 'heapBeforeMB', 'heapSampledMaxMB', 'heapAfterMB'];

const results = {
  generatedBy: 'node perf/analyze.mjs ' + dir.replace(/\\/g, '/'),
  environment: env,
  singleItem: {
    cold: { n: singleCold.length, medians: summarise(singleCold, singleKeys), runs: singleCold },
    warm: { n: singleWarm.length, medians: summarise(singleWarm, singleKeys), runs: singleWarm },
    firstScanAfterInstall: firstLoad,
  },
  heavyPage: { n: heavy.length, medians: summarise(heavy, heavyKeys), runs: heavy },
  notMeasured: {
    singleItemHeapPeak: 'Only two heap samples exist per item (immediately before and after verify()); a peak between them is not captured.',
    heavyPageHeapPeak: 'True peak not captured; heapSampledMaxMB is the largest of the per-item before/after samples.',
    cacheHits: 'Not measured. The manual scan calls verifyOne(url, true) (bypassCache) for every item, and only the manual scan writes c2pa.perf_log, so cache hits are 0 by design in this harness.',
    wasmMemory: 'performance.memory reports the offscreen document JS heap only; c2pa-web WASM linear memory is excluded.',
  },
};

fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2) + '\n');

// Markdown tables for README.md — printed, so the README quotes script output.
const fmt = (v) => (v == null ? 'n/a' : String(v));
const table = (title, runs, keys, medians) => {
  console.log(`\n### ${title}\n`);
  console.log(`| Metric | ${runs.map((_, i) => `Run ${i + 1}`).join(' | ')} | **Median** |`);
  console.log(`|---|${runs.map(() => '---:').join('|')}|---:|`);
  for (const k of keys) console.log(`| ${k} | ${runs.map((r) => fmt(r[k])).join(' | ')} | **${fmt(medians[k])}** |`);
};
table('Single item — cold', singleCold, singleKeys, results.singleItem.cold.medians);
table('Single item — warm', singleWarm, singleKeys, results.singleItem.warm.medians);
if (firstLoad) table('Single item — first scan after install (n=1)', [firstLoad], singleKeys, firstLoad);
table('Heavy page (100 items)', heavy, heavyKeys, results.heavyPage.medians);
console.log('\nHeavy-page statuses per run:', heavy.map((r) => JSON.stringify(r.statuses)).join('  '));
console.log('\nHeavy page by kind (per run):');
for (const [i, r] of heavy.entries()) {
  for (const [kind, k] of Object.entries(r.byKind)) {
    console.log(`  run ${i + 1} ${kind}: items ${k.items}, service median ${k.serviceMedianMs} ms, verify-only median ${k.verifyOnlyMedianMs} / p95 ${k.verifyOnlyP95Ms} ms, message overhead median ${k.messageOverheadMedianMs} ms, fetch median ${k.fetchMedianMs} ms`);
  }
  console.log(`  run ${i + 1} heapAfter median by quarter (MB): ${r.heapAfterByQuarterMB.join(' / ')}; videos completed at positions ${r.videoCompletionPositions.join(',')}`);
}
console.log(`\nWrote ${path.join(dir, 'results.json')}`);
