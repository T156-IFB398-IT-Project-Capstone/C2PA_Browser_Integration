// Regenerates raw.bundle.js from raw.js. Not run automatically by build.mjs —
// this directory is spike evidence, not part of the shipped extension.
//
// Needed because @contentauth/c2pa-web's published dist ships an unresolved
// bare specifier (`import ... from "highgain"`) that a browser's native ES
// module loader cannot resolve without a bundler — see the "Methodology
// note" / bundling paragraph in docs/phase2/spike-001-mp4-verification.md.
// Uses the project's existing esbuild devDependency; no new dependency.
//
// Usage: node extension/_spike-harness/bundle.mjs

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));

await esbuild.build({
  entryPoints: [DIR + 'raw.js'],
  outfile: DIR + 'raw.bundle.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: false,
});
console.log('[spike-harness] bundled raw.bundle.js');
