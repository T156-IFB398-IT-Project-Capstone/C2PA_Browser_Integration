// scripts/run-tests.mjs
// Test runner behind `npm test`. Finds every *.test.mjs under tests/ and hands
// the list to Node's built-in runner (`node --test`), propagating its exit code.
//
// Why a script instead of `node --test tests/`: how `node --test` treats its
// arguments changed between releases — Node 20 takes paths, Node 22+ takes
// glob patterns — and npm runs scripts under cmd.exe on Windows, which does no
// glob expansion. Listing the files here gives the same behaviour on Windows,
// Linux, Node 20 and Node 24. Files are passed as forward-slash paths relative
// to the repo root, which are valid both as paths and as glob patterns.
//
// Zero dependencies (CLAUDE.md constraint #5).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = 'tests';

function findTests(relDir, out = []) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') findTests(rel, out);
    } else if (entry.name.endsWith('.test.mjs')) {
      out.push(rel);
    }
  }
  return out;
}

const files = findTests(TEST_DIR).sort();

if (files.length === 0) {
  console.error(`[run-tests] No *.test.mjs files found under ${TEST_DIR}/ — refusing to report success.`);
  process.exit(1);
}

console.log(`[run-tests] ${files.length} test files`);

const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('[run-tests] Could not start node --test:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) console.error(`[run-tests] node --test was killed by ${signal}`);
  process.exit(code ?? 1);
});
