// c2pa-test-bench/build.mjs
// esbuild bundler for the test bench's live-verification entry point.
//
// Bundles verify-entry.mjs (which imports the REAL, unmodified
// extension/src/offscreen/offscreen.js verify() — not a reimplementation)
// into verify-bundle.js, loaded by index.html before app.js. Mirrors the
// root build.mjs's offscreen-document config: the .pem loader and
// __dirname/__filename defines are required for the same reason — the
// entry transitively pulls in offscreen.js's PEM trust-anchor imports and
// @contentauth/c2pa-web's CJS-format dependency tree.
//
// Run from the repo root (relies on Node's upward node_modules resolution —
// this directory deliberately has no package.json of its own):
//   node c2pa-test-bench/build.mjs

import * as esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['c2pa-test-bench/verify-entry.mjs'],
  outfile:     'c2pa-test-bench/verify-bundle.js',
  bundle: true,
  format: 'esm',
  target: ['chrome120'],
  sourcemap: 'linked',
  minify: false,
  platform: 'browser',
  loader: { '.pem': 'text' },
  define: {
    __dirname: '""',
    __filename: '""',
  },
  // Records every file that fed the bundle. `npm run dev` reads this to decide
  // whether the (~11 MB) bundle is stale, instead of rebuilding it every start
  // or guessing from a hardcoded source list that would drift.
  metafile: true,
});

writeFileSync(
  'c2pa-test-bench/verify-bundle.meta.json',
  JSON.stringify(result.metafile),
);

console.log('[c2pa-test-bench build] Done. verify-bundle.js written.');
