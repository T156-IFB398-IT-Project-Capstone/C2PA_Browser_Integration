// scripts/check-syntax.mjs
// Parse-only syntax check over the hand-written JavaScript in the repo. Run by
// CI (.github/workflows/ci.yml) and locally with `node scripts/check-syntax.mjs`.
//
// Why this exists: esbuild only sees the two bundled entry points (service
// worker, offscreen). Everything Chrome loads directly — content script, popup,
// detail page — and the Node scripts are never compiled by the build, so a
// syntax error there (e.g. the duplicate declaration a bad merge left on
// 2026-09-07) would otherwise ship unnoticed.
//
// How each file is parsed matters. package.json sets "type": "module", so
// `node --check` treats every .js file as a strict ES module. That is right for
// most files, but wrong for classic scripts: it rejects sloppy-mode syntax that
// Chrome would accept, and accepts `import`/`export`, which Chrome rejects in a
// classic script. Classic scripts are therefore compiled with vm.Script — the
// classic-script grammar — which parses without executing anything.
//
// Nothing is executed. Zero dependencies (CLAUDE.md constraint #5).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = ['extension/src', 'scripts', 'c2pa-test-bench'];

// Generated bundles: large, machine-written, and not ours to lint.
const EXCLUDE = new Set([
  'c2pa-test-bench/verify-bundle.js',
  'extension/spike-harness/raw.bundle.js',
]);
const EXCLUDE_DIRS = new Set(['node_modules', 'extension/dist']);

// Loaded by Chrome as classic (non-module) scripts.
const CLASSIC = new Set([
  'extension/src/content/content-script.js', // manifest.json content_scripts
  'c2pa-test-bench/app.js',                  // <script src="app.js"> in index.html
]);

function walk(relDir, out) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name) && !EXCLUDE_DIRS.has(rel)) walk(rel, out);
    } else if (/\.(m?js)$/.test(entry.name) && !EXCLUDE.has(rel)) {
      out.push(rel);
    }
  }
  return out;
}

function checkClassic(rel) {
  const file = path.join(ROOT, rel);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    return null;
  } catch (err) {
    return err.stack || String(err);
  }
}

function checkModule(rel) {
  const res = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], {
    encoding: 'utf8',
  });
  return res.status === 0 ? null : (res.stderr || res.stdout || `exit ${res.status}`).trim();
}

const files = SCAN_DIRS.flatMap((d) => walk(d, [])).sort();

// A missing classic script means the list above is stale — say so rather than
// silently checking it as a module (or not at all).
for (const rel of CLASSIC) {
  if (!files.includes(rel)) {
    console.error(`[check-syntax] classic script listed but not found: ${rel}`);
    process.exitCode = 1;
  }
}

let failed = 0;
for (const rel of files) {
  const kind = CLASSIC.has(rel) ? 'classic' : 'module';
  const error = kind === 'classic' ? checkClassic(rel) : checkModule(rel);
  if (error) {
    failed++;
    console.error(`FAIL  ${rel} (${kind})\n${error}\n`);
  } else {
    console.log(`ok    ${rel} (${kind})`);
  }
}

console.log(`\n[check-syntax] ${files.length} files, ${failed} failed`);
if (failed) process.exitCode = 1;
