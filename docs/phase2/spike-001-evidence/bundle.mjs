// Regenerates plain-harness.bundle.js and perf-harness.bundle.js from their
// sources. Uses the project's existing esbuild devDependency; no new
// dependency. Needed for the same reason as extension/_spike-harness/bundle.mjs —
// @contentauth/c2pa-web's published dist ships an unresolved bare specifier
// ("highgain") that a browser's native ES module loader can't resolve
// unbundled.
//
// Usage: node docs/phase2/spike-001-evidence/bundle.mjs

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));

for (const name of ['plain-harness', 'perf-harness']) {
  await esbuild.build({
    entryPoints: [DIR + name + '.js'],
    outfile: DIR + name + '.bundle.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    sourcemap: false,
  });
  console.log(`[spike-001-evidence] bundled ${name}.bundle.js`);
}
