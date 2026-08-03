// Early error capture, split into its own file because the extension CSP
// (script-src 'self' 'wasm-unsafe-eval') disallows inline <script> blocks.
fetch('http://127.0.0.1:8973/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: 'extension-page-raw-sdk', outcome: 'page-loaded', ts: new Date().toISOString() }) });
window.addEventListener('error', (e) => fetch('http://127.0.0.1:8973/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: 'extension-page-raw-sdk', outcome: 'early-window-error', error: { message: e.message }, ts: new Date().toISOString() }) }));
