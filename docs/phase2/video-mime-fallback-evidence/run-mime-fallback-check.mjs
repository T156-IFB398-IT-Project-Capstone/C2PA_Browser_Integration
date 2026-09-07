// Chrome-free, repeatable proof of the fetchAsBytes() .mp4 Content-Type
// fallback fix in extension/src/background/service-worker.js.
//
// Stubs the minimal `chrome` surface service-worker.js touches at module
// top-level (chrome.alarms, chrome.runtime.on*, chrome.tabs.on*) purely so
// importing it doesn't throw — none of these are exercised by fetchAsBytes()
// itself. Then calls the real, unmodified fetchAsBytes() against every route
// on mime-fallback-server.mjs and records the raw resolved mediaType per
// case, matching SPIKE-001's "raw output, not summarised" evidence convention.
//
// Usage: start mime-fallback-server.mjs first (node mime-fallback-server.mjs),
// then: node run-mime-fallback-check.mjs [pre-fix|post-fix]

const noop = () => {};
const stubEvent = () => ({ addListener: noop });

globalThis.chrome = {
  alarms: { get: noop, create: noop, onAlarm: stubEvent() },
  offscreen: { hasDocument: async () => false, createDocument: async () => {}, Reason: { WORKERS: 'WORKERS' } },
  runtime: { onMessage: stubEvent(), onInstalled: stubEvent(), onStartup: stubEvent(), sendMessage: async () => ({}) },
  tabs: { onRemoved: stubEvent(), onUpdated: stubEvent() },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};

const label = process.argv[2] ?? 'run';
const PORT = 8974;
const base = `http://127.0.0.1:${PORT}/assets`;

const cases = [
  { name: 'sora.mp4 / correct Content-Type',    url: `${base}/sora.mp4?condition=correct` },
  { name: 'sora.mp4 / missing Content-Type',    url: `${base}/sora.mp4?condition=missing` },
  { name: 'sora.mp4 / octet-stream',            url: `${base}/sora.mp4?condition=octet` },
  { name: 'unsigned.mp4 / correct Content-Type', url: `${base}/unsigned.mp4?condition=correct` },
  { name: 'unsigned.mp4 / octet-stream',        url: `${base}/unsigned.mp4?condition=octet` },
  { name: 'car.jpg / correct Content-Type (regression)', url: `${base}/car.jpg?condition=correct` },
  { name: 'car.jpg / octet-stream (regression)',         url: `${base}/car.jpg?condition=octet` },
];

const { fetchAsBytes } = await import('../../../extension/src/background/service-worker.js');

const results = [];
for (const c of cases) {
  try {
    const { mediaType, bytes } = await fetchAsBytes(c.url);
    results.push({ case: c.name, url: c.url, resolvedMediaType: mediaType, byteLength: bytes.length });
  } catch (err) {
    results.push({ case: c.name, url: c.url, error: err.message ?? String(err) });
  }
}

console.log(JSON.stringify(results, null, 2));

const fs = await import('node:fs');
const outPath = new URL(`./results-${label}.json`, import.meta.url);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nWritten to ${outPath.pathname}`);
