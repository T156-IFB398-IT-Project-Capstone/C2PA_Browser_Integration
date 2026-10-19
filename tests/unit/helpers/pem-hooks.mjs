// Module load hook: `import x from '….pem'` yields the file's text as the
// default export — what esbuild's '.pem': 'text' loader does for the extension,
// test bench and engine-check bundles (build.mjs). Node cannot import .pem
// files on its own, and offscreen.js imports the bundled C2PA trust lists.
// Registered for every test file by scripts/run-tests.mjs (--import
// tests/unit/helpers/register-pem.mjs).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.pem')) {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
