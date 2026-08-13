// build.mjs
// esbuild bundler for the C2PA extension.
//
// Two entry points:
//   1. extension/src/background/service-worker.js
//      → extension/dist/service-worker.js
//      Bundles the SW with its local shared/ imports. Does NOT include c2pa-js;
//      verification is delegated to the offscreen document via message passing.
//
//   2. extension/src/offscreen/offscreen.js
//      → extension/dist/offscreen.js
//      Bundles the offscreen document with @contentauth/c2pa-web (inline mode),
//      which bakes the WASM binary as base64 — no separate .wasm file to serve.
//
// Usage:
//   node build.mjs           — one-shot production build
//   node build.mjs --watch   — incremental rebuild on file change

import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

// Ensure output directory exists before building.
mkdirSync('extension/dist', { recursive: true });

const sharedConfig = {
  bundle: true,
  format: 'esm',       // MV3 service workers + offscreen pages support ESM
  target: ['chrome120'],
  sourcemap: 'linked',    // <file>.js.map alongside output — keeps output readable
  minify: false,       // stay readable during development
  platform: 'browser',
  loader: { '.pem': 'text' },
};

// ── Entry 1: Service Worker ───────────────────────────────────────────────────
const swCtx = await esbuild.context({
  ...sharedConfig,
  entryPoints: ['extension/src/background/service-worker.js'],
  outfile: 'extension/dist/service-worker.js',
});

// ── Entry 2: Offscreen Document ───────────────────────────────────────────────
// Some CJS-format packages in the c2pa-web dependency tree reference
// __dirname / __filename. Replace them with safe stubs for browser bundling.
const offscreenCtx = await esbuild.context({
  ...sharedConfig,
  entryPoints: ['extension/src/offscreen/offscreen.js'],
  outfile: 'extension/dist/offscreen.js',
  define: {
    __dirname: '""',
    __filename: '""',
  },
});

// ── Run ───────────────────────────────────────────────────────────────────────
if (watch) {
  await swCtx.watch();
  await offscreenCtx.watch();
  console.log('[build] Watching for changes…  (Ctrl-C to stop)');
} else {
  await Promise.all([swCtx.rebuild(), offscreenCtx.rebuild()]);
  await swCtx.dispose();
  await offscreenCtx.dispose();
  console.log('[build] Done. Output written to extension/dist/');
}
