// SPIKE-001 — temporary, throwaway harness file. NOT part of the shipped
// extension; deleted before this branch is proposed for merge.
//
// Sends the exact same VERIFY_REQUEST message the real service-worker.js
// sends, to whichever page currently has offscreen.js's
// chrome.runtime.onMessage listener registered (expected: a separate tab
// navigated directly to the real, unmodified src/offscreen/offscreen.html).
// Captures the exact, unmodified {status, manifest, error} the shipped
// offscreen.js verify() returns — this is production code, untouched.

const REPORT_URL = 'http://127.0.0.1:8973/report';
const VERIFY_REQUEST = 'c2pa/verify_request';

async function report(payload) {
  await fetch(REPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'offscreen-doc-shipped-code', ts: new Date().toISOString(), ...payload }),
  });
}

async function fetchBytesAndNaturalType(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const blob = await res.clone().blob();
  return { bytes: Array.from(new Uint8Array(buf)), naturalBlobType: blob.type, contentTypeHeader: res.headers.get('Content-Type') };
}

async function runCase({ asset, assetUrl, mimeMode, mimeUsed, bytes, naturalBlobType, contentTypeHeader }) {
  const base = { asset, assetUrl, mimeMode, mimeUsed, naturalBlobType, contentTypeHeader };
  try {
    const response = await chrome.runtime.sendMessage({
      type: VERIFY_REQUEST,
      payload: { bytes, mimeType: mimeUsed },
      ts: Date.now(),
    });
    await report({ ...base, outcome: 'response', response });
  } catch (err) {
    await report({ ...base, outcome: 'sendMessage-threw', error: { name: err?.name, message: err?.message } });
  }
}

async function main() {
  await report({ outcome: 'started' });

  const v1 = await fetchBytesAndNaturalType('http://127.0.0.1:8973/assets/sora.mp4');
  const v2 = await fetchBytesAndNaturalType('http://127.0.0.1:8973/assets/unsigned.mp4');

  const cases = [
    { asset: 'V1-sora', assetUrl: 'http://127.0.0.1:8973/assets/sora.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v1 },
    { asset: 'V1-sora', assetUrl: 'http://127.0.0.1:8973/assets/sora.mp4', mimeMode: 'natural-blob-type', mimeUsed: v1.naturalBlobType, ...v1 },
    { asset: 'V2-unsigned', assetUrl: 'http://127.0.0.1:8973/assets/unsigned.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v2 },
  ];

  for (const c of cases) await runCase(c);
  await report({ done: true });
}

main().catch(async (err) => {
  await report({ outcome: 'fatal', error: { name: err?.name, message: err?.message } });
});
