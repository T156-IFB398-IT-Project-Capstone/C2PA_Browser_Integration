// SPIKE-001 — Run 1: "plain page context".
// Drives @contentauth/c2pa-web directly, no chrome.* APIs, no offscreen
// document, no extension. Isolates SDK capability from extension plumbing.

import { createC2pa } from '@contentauth/c2pa-web/inline';

const log = document.getElementById('log');
function print(s) { log.textContent += '\n' + s; console.log(s); }

async function report(payload) {
  await fetch('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: 'plain-page', ts: new Date().toISOString(), ...payload }),
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
      print(`${asset} / ${mimeMode} (${mimeUsed}) -> reader null (no manifest)`);
      return;
    }
    const store = await reader.manifestStore();
    await reader.free();
    // Serialize exactly what manifestStore() returns, no picking of fields.
    const raw = JSON.parse(JSON.stringify(store));
    await report({ ...base, outcome: 'reader-ok', manifestStore: raw });
    print(`${asset} / ${mimeMode} (${mimeUsed}) -> validation_state=${raw?.validation_state}`);
  } catch (err) {
    await report({
      ...base,
      outcome: 'threw',
      error: { name: err?.name, message: err?.message, stack: String(err?.stack ?? '') },
    });
    print(`${asset} / ${mimeMode} (${mimeUsed}) -> THREW ${err?.name}: ${err?.message}`);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)),
  ]);
}

window.addEventListener('error', (e) => {
  report({ context: 'plain-page', outcome: 'window-error', error: { message: e.message, filename: e.filename, lineno: e.lineno } });
});
window.addEventListener('unhandledrejection', (e) => {
  report({ context: 'plain-page', outcome: 'unhandledrejection', error: { message: String(e.reason?.message ?? e.reason) } });
});

async function main() {
  await report({ context: 'plain-page', outcome: 'started' });
  print('createC2pa()...');
  const c2pa = await withTimeout(createC2pa(), 20000, 'createC2pa()');
  print('c2pa-web ready.');
  await report({ context: 'plain-page', outcome: 'sdk-ready' });

  const v1 = await fetchBlob('/assets/sora.mp4');
  print(`V1 fetched: naturalBlobType="${v1.naturalBlobType}" contentTypeHeader="${v1.contentTypeHeader}"`);

  const v2 = await fetchBlob('/assets/unsigned.mp4');
  print(`V2 fetched: naturalBlobType="${v2.naturalBlobType}" contentTypeHeader="${v2.contentTypeHeader}"`);

  const cases = [
    { asset: 'V1-sora', assetUrl: '/assets/sora.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v1 },
    { asset: 'V1-sora', assetUrl: '/assets/sora.mp4', mimeMode: 'natural-blob-type',  mimeUsed: v1.naturalBlobType, ...v1 },
    { asset: 'V1-sora', assetUrl: '/assets/sora.mp4', mimeMode: 'explicit-application/mp4', mimeUsed: 'application/mp4', ...v1 },
    { asset: 'V2-unsigned', assetUrl: '/assets/unsigned.mp4', mimeMode: 'explicit-video/mp4', mimeUsed: 'video/mp4', ...v2 },
  ];

  for (const c of cases) {
    await runCase({ ...c, c2pa });
  }

  await report({ done: true });
  print('\nALL CASES DONE');
  document.title = 'DONE';
}

main().catch(async (err) => {
  print('FATAL: ' + err.message);
  await report({ context: 'plain-page', outcome: 'fatal', error: { name: err?.name, message: err?.message, stack: String(err?.stack ?? '') } });
  document.title = 'DONE';
});
