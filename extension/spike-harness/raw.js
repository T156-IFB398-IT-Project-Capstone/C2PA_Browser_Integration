// SPIKE-001 evidence harness — see README.md in this directory. Not shipped
// extension code.
//
// Tests whether the SDK itself behaves differently merely by running inside
// an extension-origin page (chrome-extension://, CSP "wasm-unsafe-eval")
// versus a plain http page. Imports c2pa-web directly — this is NOT the
// shipped offscreen.js code path (see send.js + the real offscreen.html for
// that).

import { createC2pa } from '@contentauth/c2pa-web/inline';

// Requires docs/phase2/spike-001-evidence/harness-server.mjs running on this port.
const REPORT_URL = 'http://127.0.0.1:8973/report';

async function report(payload) {
  await fetch(REPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'extension-page-raw-sdk', ts: new Date().toISOString(), ...payload }),
  });
}

async function fetchBlob(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return { blob, naturalBlobType: blob.type, contentTypeHeader: res.headers.get('Content-Type') };
}

async function runCase({ asset, assetUrl, mimeMode, mimeUsed, blob, naturalBlobType, contentTypeHeader, c2pa }) {
  const base = { asset, assetUrl, mimeMode, mimeUsed, naturalBlobType, contentTypeHeader };
  try {
    const reader = await c2pa.reader.fromBlob(mimeUsed, blob);
    if (!reader) {
      await report({ ...base, outcome: 'reader-null', manifestStore: null });
      return;
    }
    const store = await reader.manifestStore();
    await reader.free();
    const raw = JSON.parse(JSON.stringify(store));
    await report({ ...base, outcome: 'reader-ok', manifestStore: raw });
  } catch (err) {
    await report({ ...base, outcome: 'threw', error: { name: err?.name, message: err?.message, stack: String(err?.stack ?? '') } });
  }
}

async function main() {
  await report({ outcome: 'started' });
  const c2pa = await createC2pa();
  await report({ outcome: 'sdk-ready' });

  const v1 = await fetchBlob('http://127.0.0.1:8973/assets/sora.mp4');
  const v2 = await fetchBlob('http://127.0.0.1:8973/assets/unsigned.mp4');

  const cases = [
    { asset: 'V1-sora', assetUrl: 'http://127.0.0.1:8973/assets/sora.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v1 },
    { asset: 'V1-sora', assetUrl: 'http://127.0.0.1:8973/assets/sora.mp4', mimeMode: 'natural-blob-type', mimeUsed: v1.naturalBlobType, ...v1 },
    { asset: 'V2-unsigned', assetUrl: 'http://127.0.0.1:8973/assets/unsigned.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v2 },
  ];

  for (const c of cases) await runCase({ ...c, c2pa });
  await report({ done: true });
}

main().catch(async (err) => {
  await report({ outcome: 'fatal', error: { name: err?.name, message: err?.message, stack: String(err?.stack ?? '') } });
});
