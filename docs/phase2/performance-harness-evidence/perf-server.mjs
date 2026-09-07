// Static server for the Sprint 3 performance harness test pages.
// Node built-ins only (node:http, node:fs, node:path) — no new dependency,
// same precedent as spike-001-evidence/harness-server.mjs and
// video-mime-fallback-evidence/mime-fallback-server.mjs.
//
// Serves single-image.html, single-video.html, and heavy-page.html (100+
// items) against the repo's real trusted fixtures, each item under a unique
// query string so neither the browser's HTTP cache nor the extension's own
// resultCache collapse repeated fixtures into one real fetch/verify — see
// generate-heavy-page.mjs for why that matters.
//
// This is a standalone local page, not part of c2pa-test-bench/ (Jonah's
// area) — kept separate deliberately, see the Sprint 3 performance harness
// README.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT     = path.resolve(EVIDENCE_DIR, '..', '..', '..'); // docs/phase2/performance-harness-evidence/ -> repo root
const PORT           = 8975;

const MIME = {
  '.html': 'text/html',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.mp4':  'video/mp4',
};

const FIXTURES = {
  'car.jpg':            path.join(REPO_ROOT, 'test-assets/trusted/car.jpg'),
  'cloudscape.jpeg':     path.join(REPO_ROOT, 'test-assets/trusted/cloudscape.jpeg'),
  'crater-lake.jpg':     path.join(REPO_ROOT, 'test-assets/trusted/crater-lake.jpg'),
  'earth_apollo17.jpg':  path.join(REPO_ROOT, 'test-assets/trusted/earth_apollo17.jpg'),
  'Firefly-cat.jpg':     path.join(REPO_ROOT, 'test-assets/trusted/Firefly-cat.jpg'),
  'ChatGPTgen.png':      path.join(REPO_ROOT, 'test-assets/trusted/ChatGPTgen.png'),
  'sora.mp4':            path.join(REPO_ROOT, 'test-assets/trusted/sora.MP4'),
  'unsigned.mp4':        path.join(REPO_ROOT, 'docs/phase2/spike-001-evidence/unsigned-no-manifest.mp4'),
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(res, absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(absPath).toLowerCase();
  const data = fs.readFileSync(absPath);
  send(res, 200, data, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  const fixtureMatch = url.pathname.match(/^\/fixtures\/([^/]+)$/);
  if (fixtureMatch && FIXTURES[fixtureMatch[1]]) {
    serveFile(res, FIXTURES[fixtureMatch[1]]);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/heavy-page.html') {
    serveFile(res, path.join(EVIDENCE_DIR, 'heavy-page.html'));
    return;
  }
  if (url.pathname === '/single-image.html' || url.pathname === '/single-video.html') {
    serveFile(res, path.join(EVIDENCE_DIR, url.pathname));
    return;
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[perf-server] listening on http://127.0.0.1:${PORT}`);
  console.log('Pages: /single-image.html, /single-video.html, /heavy-page.html');
});
