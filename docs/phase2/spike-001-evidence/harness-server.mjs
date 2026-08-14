// Minimal static file + report-collector server for SPIKE-001.
// No new dependency: uses only Node built-ins (node:http, node:fs, node:path).
// Serves node_modules (so the harness page can import c2pa-web as a real ESM
// module, exactly as offscreen.js does) and the two MP4 fixtures, and accepts
// POST /report bodies from the browser page(s) it drives.
//
// Content-Type lookup is DELIBERATELY naive (extension match, no case
// normalisation) — this is the "whatever blob.type naturally yields" leg of
// the MIME test. A naive/misconfigured static server not lower-casing the
// extension before lookup is a realistic real-world failure mode, and the
// repo's own fixture (`sora.MP4`, uppercase extension) exercises exactly it.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT     = path.resolve(EVIDENCE_DIR, '..', '..', '..'); // docs/phase2/spike-001-evidence/ -> repo root
const PORT           = 8973;

// Deliberately naive extension -> Content-Type map (no case folding).
const MIME = {
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.mp4':  'video/mp4',      // NOTE: lowercase key only, on purpose
  '.json': 'application/json',
};

const results = [];

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(res, absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(absPath); // NOT lower-cased — naive on purpose
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const data = fs.readFileSync(absPath);
  send(res, 200, data, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
  console.log(`[serve] ${absPath}  Content-Type: ${contentType}  (${data.length} bytes)`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    send(res, 204, '', {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/report') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }
      results.push(parsed);
      console.log('\n=== REPORT RECEIVED ===');
      console.log(JSON.stringify(parsed, null, 2));
      console.log('=== END REPORT ===\n');
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'results.json'), JSON.stringify(results, null, 2));
      send(res, 200, 'ok', { 'Access-Control-Allow-Origin': '*' });
    });
    return;
  }

  if (url.pathname === '/node_modules' || url.pathname.startsWith('/node_modules/')) {
    serveFile(res, path.join(REPO_ROOT, url.pathname));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    if (url.pathname === '/assets/sora.mp4') {
      serveFile(res, path.join(REPO_ROOT, 'test-assets/trusted/sora.MP4'));
      return;
    }
    if (url.pathname === '/assets/unsigned.mp4') {
      serveFile(res, path.join(EVIDENCE_DIR, 'unsigned-no-manifest.mp4'));
      return;
    }
    send(res, 404, 'Not found');
    return;
  }

  // Harness page + script served from this directory.
  serveFile(res, path.join(EVIDENCE_DIR, url.pathname === '/' ? '/plain-harness.html' : url.pathname));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[harness-server] listening on http://127.0.0.1:${PORT}`);
});
