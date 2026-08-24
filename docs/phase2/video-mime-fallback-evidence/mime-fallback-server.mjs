// Minimal static server for the fetchAsBytes() .mp4 Content-Type fallback fix.
// No new dependency: Node built-ins only (node:http, node:fs, node:path).
//
// Serves the repo's real MP4/image fixtures under deliberately varied
// Content-Type conditions (correct / missing / generic octet-stream) so
// run-mime-fallback-check.mjs can prove, pre-fix and post-fix, exactly what
// extension/src/background/service-worker.js's fetchAsBytes() resolves
// `mediaType` to in each case. Mirrors the precedent already set by
// docs/phase2/spike-001-evidence/harness-server.mjs.
//
// Also serves /test-page.html for the Tier 2 manual walkthrough (load the
// unpacked extension in real Chrome, navigate here, click "Scan this page").

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT     = path.resolve(EVIDENCE_DIR, '..', '..', '..'); // docs/phase2/video-mime-fallback-evidence/ -> repo root
const PORT           = 8974;

const FIXTURES = {
  'sora.mp4':        path.join(REPO_ROOT, 'test-assets/trusted/sora.MP4'),
  'unsigned.mp4':     path.join(REPO_ROOT, 'docs/phase2/spike-001-evidence/unsigned-no-manifest.mp4'),
  'car.jpg':          path.join(REPO_ROOT, 'test-assets/trusted/car.jpg'),
};

// Routes: /assets/<fixture>?condition=<correct|missing|octet>
//   correct  -> the real, correct Content-Type
//   missing  -> no Content-Type header at all
//   octet    -> application/octet-stream (the realistic "server didn't set it" case)
// Query-string form (not a /condition path segment) keeps the fixture's real
// extension at the end of the URL (".../car.jpg?condition=octet"), matching
// fetchAsBytes()'s own extension regexes (`/\.jpe?g(\?|$)/i` etc.), which
// require the extension immediately followed by "?" or end-of-string — the
// same shape a real CDN URL like "video.mp4?token=..." has.
const CORRECT_TYPE = {
  'sora.mp4':     'video/mp4',
  'unsigned.mp4': 'video/mp4',
  'car.jpg':      'image/jpeg',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFixture(res, fixtureName, condition) {
  const absPath = FIXTURES[fixtureName];
  if (!absPath || !fs.existsSync(absPath)) {
    send(res, 404, `Not found: ${fixtureName}`);
    return;
  }
  const data = fs.readFileSync(absPath);
  const headers = { 'Access-Control-Allow-Origin': '*' };
  if (condition === 'correct') headers['Content-Type'] = CORRECT_TYPE[fixtureName];
  else if (condition === 'octet') headers['Content-Type'] = 'application/octet-stream';
  // condition === 'missing' -> no Content-Type header set at all
  send(res, 200, data, headers);
  console.log(`[serve] /assets/${fixtureName}/${condition}  Content-Type: ${headers['Content-Type'] ?? '(none)'}  (${data.length} bytes)`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    send(res, 204, '', {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    return;
  }

  const assetMatch = url.pathname.match(/^\/assets\/([^/]+)$/);
  const condition = url.searchParams.get('condition');
  if (assetMatch && ['correct', 'missing', 'octet'].includes(condition)) {
    serveFixture(res, assetMatch[1], condition);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/test-page.html') {
    serveFile(res, path.join(EVIDENCE_DIR, 'test-page.html'));
    return;
  }

  send(res, 404, 'Not found');
});

function serveFile(res, absPath) {
  if (!fs.existsSync(absPath)) {
    send(res, 404, 'Not found');
    return;
  }
  send(res, 200, fs.readFileSync(absPath), { 'Content-Type': 'text/html' });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mime-fallback-server] listening on http://127.0.0.1:${PORT}`);
  console.log('Routes: /assets/<sora.mp4|unsigned.mp4|car.jpg>/<correct|missing|octet>');
});
