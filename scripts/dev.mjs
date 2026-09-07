// scripts/dev.mjs
// One-command local development environment. Started by `npm run dev`.
//
// Runs three things in a single terminal:
//   1. the extension bundler in watch mode (build.mjs --watch, as a child process)
//   2. a freshness check that rebuilds c2pa-test-bench/verify-bundle.js only if
//      one of its sources changed — the bundle is ~11 MB, so an unconditional
//      rebuild on every start is wasteful
//   3. a static file server for c2pa-test-bench/ on http://127.0.0.1:8976,
//      the URL the popup's test-bench button opens (TEST_BENCH_URLS.local in
//      extension/src/shared/constants.js)
//
// Zero dependencies — child_process and node:http only, deliberately. See
// CLAUDE.md constraint #5 (no new dependency without asking).
//
// Ctrl-C shuts down the watcher and the server together; see shutdown() below.

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = 8976;

const BENCH_DIR = path.join(ROOT, 'c2pa-test-bench');
const BUNDLE    = path.join(BENCH_DIR, 'verify-bundle.js');
const META      = path.join(BENCH_DIR, 'verify-bundle.meta.json');

// ── 1. Test-bench bundle freshness ────────────────────────────────────────────

// True when verify-bundle.js exists and no input recorded in its metafile has a
// newer mtime. node_modules inputs are skipped: they only change on install,
// and package.json's postinstall rebuilds the bundle at that point.
function bundleIsFresh() {
  if (!fs.existsSync(BUNDLE) || !fs.existsSync(META)) return false;

  const builtAt = fs.statSync(BUNDLE).mtimeMs;

  let inputs;
  try {
    inputs = Object.keys(JSON.parse(fs.readFileSync(META, 'utf8')).inputs);
  } catch {
    return false;               // unreadable/corrupt metafile — rebuild
  }

  for (const rel of inputs) {
    if (rel.includes('node_modules')) continue;
    try {
      if (fs.statSync(path.join(ROOT, rel)).mtimeMs > builtAt) return false;
    } catch {
      return false;             // a recorded input is gone — rebuild
    }
  }
  return true;
}

// Runs c2pa-test-bench/build.mjs to completion. Kept as a child process so the
// build config lives in exactly one place rather than being duplicated here.
function buildBundle() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['c2pa-test-bench/build.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`test-bench build exited with code ${code}`)),
    );
  });
}

// ── 2. Static server ──────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
  '.pem':  'text/plain; charset=utf-8',
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
    } catch {
      res.writeHead(400).end('Bad Request');
      return;
    }

    const target = path.join(BENCH_DIR, urlPath === '/' ? 'index.html' : urlPath);

    // Path-traversal guard: the resolved path must stay inside BENCH_DIR.
    const rel = path.relative(BENCH_DIR, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(target, (err, stat) => {
      const file = !err && stat.isDirectory() ? path.join(target, 'index.html') : target;
      fs.readFile(file, (readErr, data) => {
        if (readErr) {
          console.log(`[serve] 404 ${urlPath}`);
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',   // always re-read during development
        }).end(data);
      });
    });
  });
}

// ── 3. Shutdown ───────────────────────────────────────────────────────────────

let watcher = null;
let server  = null;
let shuttingDown = false;

// Ctrl-C in a terminal signals every process in the console group, so the
// watcher usually receives SIGINT directly too — but it is killed explicitly
// here so programmatic SIGTERM and crash paths behave identically and cannot
// leave an orphan holding port 8976.
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[dev] Shutting down…');

  if (watcher && watcher.exitCode === null) watcher.kill();

  if (server) {
    // Browsers hold keep-alive sockets open; without dropping them, close()
    // waits for them and the process appears to hang on Ctrl-C.
    server.closeAllConnections?.();
    server.close(() => process.exit(code));
    // Backstop in case a socket still keeps the loop alive.
    setTimeout(() => process.exit(code), 2000).unref();
  } else {
    process.exit(code);
  }
}

process.on('SIGINT',  () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ── Main ──────────────────────────────────────────────────────────────────────

if (bundleIsFresh()) {
  console.log('[dev] Test-bench bundle is up to date — skipping rebuild.');
} else {
  // This runs before the server binds, so 127.0.0.1:8976 is unreachable until
  // it finishes. That is a ~11 MB bundle: normally a second or two, but slower
  // on a cold cache or when on-access antivirus scans the output. Say so
  // explicitly — an unexplained silent wait reads as a hung or broken setup.
  // A pull that touches offscreen.js, constants.js or the trust-list PEMs is
  // the usual reason this is not already up to date.
  console.log('[dev] Test-bench bundle is missing or out of date — rebuilding it now.');
  console.log(`[dev] It is ~11 MB, so this can take a few seconds. http://${HOST}:${PORT}`);
  console.log('[dev] starts serving once it finishes.');

  const startedAt = Date.now();
  try {
    await buildBundle();
  } catch (err) {
    console.error(`[dev] Could not build the test-bench bundle: ${err.message}`);
    process.exit(1);
  }
  console.log(`[dev] Test-bench bundle rebuilt in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
}

server = createServer();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[dev] Port ${PORT} is already in use — another dev server is probably ` +
      `still running.\n` +
      `[dev] Find it with:  netstat -ano | findstr ${PORT}   (Windows)\n` +
      `[dev]                lsof -i :${PORT}                 (macOS/Linux)`,
    );
  } else {
    console.error(`[dev] Server error: ${err.message}`);
  }
  shutdown(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] Test bench on http://${HOST}:${PORT}`);

  // Started only once the port is actually held, so a port clash fails before
  // a watcher is spawned rather than leaving one behind.
  watcher = spawn(process.execPath, ['build.mjs', '--watch'], {
    cwd: ROOT,
    stdio: 'inherit',   // build.mjs already prefixes its output with [build]
  });

  watcher.on('error', (err) => {
    console.error(`[dev] Could not start the extension watcher: ${err.message}`);
    shutdown(1);
  });

  watcher.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[dev] Extension watcher exited unexpectedly (code ${code}).`);
    shutdown(code ?? 1);
  });

  // Don't claim to be ready until the extension bundles actually exist.
  // manifest.json points at dist/service-worker.js, so loading the unpacked
  // extension before the first build lands fails with "Could not load
  // manifest" — which looks like a broken repo rather than a race.
  waitForExtensionBuild();
});

async function waitForExtensionBuild() {
  const outputs = [
    path.join(ROOT, 'extension/dist/service-worker.js'),
    path.join(ROOT, 'extension/dist/offscreen.js'),
  ];

  for (let i = 0; i < 600 && !shuttingDown; i++) {          // up to ~60s
    if (outputs.every(f => fs.existsSync(f))) {
      console.log(`[dev] Ready — load ${path.join(ROOT, 'extension')} unpacked at chrome://extensions`);
      console.log('[dev] Watching the extension and serving the test bench. Ctrl-C to stop.');
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (!shuttingDown) {
    console.warn('[dev] extension/dist/ still missing after 60s — check the [build] output above.');
  }
}
