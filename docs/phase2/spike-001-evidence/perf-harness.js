// SPIKE-001 Q4 — wall-clock + JS-heap cost of verifying sora.MP4 (5.3 MB),
// isolated plain-page context (same isolation rationale as the Q1/Q2 harness).
import { createC2pa } from '@contentauth/c2pa-web/inline';

async function report(payload) {
  await fetch('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'perf', ts: new Date().toISOString(), ...payload }),
  });
}

function heap() {
  return performance.memory
    ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit }
    : null;
}

async function main() {
  await report({ event: 'perf-start', heap: heap() });

  const t0 = performance.now();
  const c2pa = await createC2pa();
  const t1 = performance.now();
  await report({ event: 'sdk-init', ms: +(t1 - t0).toFixed(2), heap: heap() });

  const t2 = performance.now();
  const res = await fetch('/assets/sora.mp4');
  const blob = await res.blob();
  const t3 = performance.now();
  await report({ event: 'fetch-v1', ms: +(t3 - t2).toFixed(2), bytes: blob.size, heap: heap() });

  const t4 = performance.now();
  const reader = await c2pa.reader.fromBlob('video/mp4', blob);
  const t5 = performance.now();
  await report({ event: 'fromBlob', ms: +(t5 - t4).toFixed(2), heap: heap() });

  const t6 = performance.now();
  const store = await reader.manifestStore();
  const t7 = performance.now();
  await report({ event: 'manifestStore', ms: +(t7 - t6).toFixed(2), validation_state: store?.validation_state, heap: heap() });

  const t8 = performance.now();
  await reader.free();
  const t9 = performance.now();
  await report({ event: 'free', ms: +(t9 - t8).toFixed(2), heap: heap() });

  const totalVerifyMs = +(t7 - t4).toFixed(2); // fromBlob + manifestStore only (excludes SDK cold-start, excludes fetch)
  const totalWithColdStartMs = +(t7 - t0).toFixed(2); // includes SDK init + fetch, i.e. worst case first-ever call
  await report({ event: 'summary', assetBytes: blob.size, sdkInitMs: +(t1 - t0).toFixed(2), fetchMs: +(t3 - t2).toFixed(2), verifyOnlyMs: totalVerifyMs, coldStartTotalMs: totalWithColdStartMs, finalHeap: heap() });

  await report({ done: true });
}

main().catch(async (err) => {
  await report({ event: 'fatal', error: { name: err?.name, message: err?.message } });
});
