// scripts/validate-c2pa-api.mjs
//
// Attempts to run @contentauth/c2pa-web/inline in Node.js to validate the
// real API output shape against a signed test asset.
//
// EXPECTED RESULT in Node.js:
//   c2pa-web is browser-targeted. It spawns a Web Worker using
//   URL.createObjectURL(), which does not exist in Node.js. The script will
//   fail with a clear error documenting exactly where the boundary is.
//
// ALTERNATIVE (browser-based):
//   See the fallback instructions printed at the end of this script, or open
//   scripts/validate-c2pa-browser.html directly in a browser with the
//   extension loaded.
//
// Usage:
//   node scripts/validate-c2pa-api.mjs

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join }  from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET     = join(__dirname, '../test-assets/trusted/earth_apollo17.jpg');

console.log('='.repeat(60));
console.log('C2PA API output validator');
console.log('='.repeat(60));
console.log('');
console.log('Step 1 — import @contentauth/c2pa-web/inline …');

let createC2pa;
try {
  ({ createC2pa } = await import('@contentauth/c2pa-web/inline'));
  console.log('  ✓ import succeeded');
} catch (err) {
  console.error('  ✗ import failed:', err.message);
  printFallback();
  process.exit(1);
}

console.log('Step 2 — createC2pa() …');
let c2pa;
try {
  c2pa = await createC2pa();
  console.log('  ✓ SDK initialised');
} catch (err) {
  console.error('  ✗ createC2pa() failed:', err.message);
  printFallback();
  process.exit(1);
}

console.log('Step 3 — load test asset …');
let bytes;
try {
  bytes = await readFile(ASSET);
  console.log(`  ✓ loaded ${ASSET} (${bytes.byteLength.toLocaleString()} bytes)`);
} catch (err) {
  console.error('  ✗ could not read test asset:', err.message);
  console.error('    Add a signed JPEG to test-assets/trusted/earth_apollo17.jpg');
  process.exit(1);
}

console.log('Step 4 — reader.fromBlob() …');
let reader;
try {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  reader = await c2pa.reader.fromBlob('image/jpeg', blob);
  if (!reader) {
    console.log('  reader returned null — asset has no C2PA manifest');
    process.exit(0);
  }
  console.log('  ✓ reader created');
} catch (err) {
  console.error('  ✗ fromBlob() failed:', err.message);
  printFallback();
  process.exit(1);
}

console.log('Step 5 — reader.manifestStore() …');
try {
  const store = await reader.manifestStore();
  await reader.free();

  console.log('');
  console.log('='.repeat(60));
  console.log('RAW manifestStore() OUTPUT:');
  console.log('='.repeat(60));
  console.log(JSON.stringify(store, null, 2));
} catch (err) {
  console.error('  ✗ manifestStore() failed:', err.message);
  printFallback();
  process.exit(1);
}

function printFallback() {
  console.error('');
  console.error('─'.repeat(60));
  console.error('BROWSER-BASED VALIDATION (fallback):');
  console.error('─'.repeat(60));
  console.error('1. Load the extension unpacked in chrome://extensions');
  console.error('   (extension root: extension/)');
  console.error('2. Open a page containing a C2PA-signed image, or open');
  console.error('   scripts/validate-c2pa-browser.html in the browser.');
  console.error('3. Open the extension\'s service-worker DevTools:');
  console.error('   chrome://extensions → "Inspect views: service worker"');
  console.error('4. Add a console.log(JSON.stringify(store, null, 2)) call');
  console.error('   inside offscreen.js verify() after reader.manifestStore()');
  console.error('   and rebuild: npm run build');
  console.error('5. Trigger a scan and copy the logged JSON from the console.');
  console.error('─'.repeat(60));
}
