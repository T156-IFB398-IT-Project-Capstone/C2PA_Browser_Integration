// tests/engine/run.mjs
//
// Engine-level check: runs the extension's REAL verifier (c2pa-web 0.13.1
// with the extension's ENGINE_SETTINGS, in Chrome) over the sample assets in
// test-assets/trusted/ and records, per asset:
//   - the final state the extension would show (VERIFY_STATUS),
//   - the raw SDK validation result (validation_state / _status / _results),
//   - every network request made while that asset was being verified.
//
// Why this exists: the unit suite (npm test) replaces c2pa-web with a
// stand-in, so it cannot show what the engine does with a given configuration.
// The final QA of 12 Oct found that a trust setting described as working since
// August validated nothing (risk R20); this check makes that kind of claim
// testable.
//
// How it works (no new dependency — Node built-ins, the repo's existing
// esbuild, and the Chrome already installed):
//   1. Bundle tests/engine/harness-entry.mjs (imports offscreen.js verifyDetailed).
//   2. Serve harness.html, the bundle and the assets on 127.0.0.1.
//   3. Launch headless Chrome with a throwaway profile under tests/engine/.tmp/
//      and drive it over the Chrome DevTools Protocol (Node's built-in
//      WebSocket). Network capture is enabled on the page AND on every Web
//      Worker it starts (c2pa-web verifies inside a worker).
//   4. Run phases one at a time: init, capture self-test, then load + verify
//      for each asset, recording which requests happened in which phase.
//
// Checks (any FAIL → exit code 1; harness error → exit code 2):
//   network-capture-self-test  a fetch from a Web Worker to a reserved .invalid
//                              host must be recorded, otherwise "no requests"
//                              would prove nothing.
//   engine-settings-applied    createC2pa() accepted ENGINE_SETTINGS (no silent
//                              fallback to SDK defaults).
//   trust-anchors              if trust.trustAnchors / userAnchors are set: each
//                              must be ONE PEM string (the SDK fetches URLs and
//                              every item of an array), and at least one asset
//                              must report signingCredential.trusted — i.e. the
//                              anchors are really active. N/A when not set.
//   remote-manifests-local     if verify.remoteManifestFetch === false: no
//                              outbound request during init or any verify phase.
//                              N/A when not set.
//
// Usage (from the repo root):
//   node tests/engine/run.mjs --out docs/phase2/engine-check/<label> [--label <label>]
//   Options: --chrome <path>  (or CHROME_PATH)   --keep-profile
// Without --out the results are printed but not written.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HERE = path.join(ROOT, 'tests', 'engine');
const TMP = path.join(HERE, '.tmp');
const ASSET_DIR = path.join(ROOT, 'test-assets', 'trusted');

const ASSETS = [
  { name: 'car.jpg',         mimeType: 'image/jpeg' },
  { name: 'ChatGPTgen.png',  mimeType: 'image/png'  },
  { name: 'crater-lake.jpg', mimeType: 'image/jpeg' },
  { name: 'cloudscape.jpeg', mimeType: 'image/jpeg' },
  { name: 'sora.MP4',        mimeType: 'video/mp4'  },
];

const PHASE_SETTLE_MS = 750;      // let late network events for a phase arrive
const STEP_TIMEOUT_MS = 120_000;

// ── Arguments ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { out: null, label: null, chrome: process.env.CHROME_PATH ?? null, keepProfile: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--chrome') args.chrome = argv[++i];
    else if (a === '--keep-profile') args.keepProfile = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.out && !args.label) args.label = path.basename(args.out);
  return args;
}

function findChrome(explicit) {
  const candidates = explicit ? [explicit] : [
    path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome not found — pass --chrome <path> or set CHROME_PATH');
  return found;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${what}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function classifyUrl(url) {
  let u;
  try { u = new URL(url); } catch { return 'other'; }
  if (['blob:', 'data:', 'about:', 'chrome:', 'chrome-extension:', 'devtools:'].includes(u.protocol)) return 'local-scheme';
  if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return 'loopback';
  return 'outbound';
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function describeTrustValue(v) {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return { form: 'array', items: v.length };
  if (typeof v !== 'string') return { form: typeof v };
  return {
    form: v.startsWith('http') ? 'url' : 'pem-string',
    certificates: (v.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length,
    bytes: Buffer.byteLength(v),
    sha256: sha256(v),
  };
}

function summarizeSettings(s) {
  const trust = s?.trust ?? {};
  return {
    trust: {
      trustAnchors: describeTrustValue(trust.trustAnchors),
      userAnchors:  describeTrustValue(trust.userAnchors),
      trustConfig:  describeTrustValue(trust.trustConfig),
      allowedList:  describeTrustValue(trust.allowedList),
    },
    cawgTrust: {
      verifyTrustList: s?.cawgTrust?.verifyTrustList ?? '(SDK default)',
      trustAnchors: describeTrustValue(s?.cawgTrust?.trustAnchors),
    },
    verify: s?.verify ?? '(SDK defaults)',
  };
}

function validationCodes(raw) {
  const active = raw?.validation_results?.activeManifest ?? {};
  const codes = (list) => (Array.isArray(list) ? list.map((x) => x?.code).filter(Boolean) : []);
  return {
    success: codes(active.success),
    informational: codes(active.informational),
    failure: codes(active.failure),
    validation_status: codes(raw?.validation_status),
  };
}

// ── Minimal Chrome DevTools Protocol client ─────────────────────────────────

class Cdp {
  #ws; #nextId = 0; #pending = new Map(); #listeners = [];

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true });
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => this.#onMessage(JSON.parse(event.data)));
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#nextId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.#ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject, method }));
  }

  on(fn) { this.#listeners.push(fn); }
  close() { this.#ws.close(); }

  #onMessage(m) {
    if (m.id !== undefined) {
      const p = this.#pending.get(m.id);
      if (!p) return;
      this.#pending.delete(m.id);
      if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
      else p.resolve(m.result);
      return;
    }
    for (const fn of this.#listeners) fn(m);
  }
}

// ── Build, serve, launch ────────────────────────────────────────────────────

async function buildBundle() {
  fs.mkdirSync(TMP, { recursive: true });
  const outfile = path.join(TMP, 'harness-bundle.js');
  // Same loader/defines as the offscreen entry in build.mjs.
  await esbuild.build({
    entryPoints: [path.join(HERE, 'harness-entry.mjs')],
    outfile,
    bundle: true,
    format: 'esm',
    target: ['chrome120'],
    platform: 'browser',
    loader: { '.pem': 'text' },
    define: { __dirname: '""', __filename: '""' },
    logLevel: 'warning',
  });
  return outfile;
}

function startServer(bundlePath) {
  const assetNames = new Set(ASSETS.map((a) => a.name));
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let file = null;
    let type = 'application/octet-stream';
    if (url.pathname === '/') { file = path.join(HERE, 'harness.html'); type = 'text/html; charset=utf-8'; }
    else if (url.pathname === '/harness-bundle.js') { file = bundlePath; type = 'text/javascript; charset=utf-8'; }
    else if (url.pathname.startsWith('/assets/')) {
      const name = decodeURIComponent(url.pathname.slice('/assets/'.length));
      if (assetNames.has(name)) file = path.join(ASSET_DIR, name);
    }
    if (!file) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launchChrome(chromePath, profileDir) {
  const child = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-extensions',
    '--mute-audio',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = new Promise((resolve, reject) => {
    let buf = '';
    child.stderr.on('data', (chunk) => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    child.on('exit', (code) => reject(new Error(`Chrome exited early (code ${code})`)));
  });
  return { child, wsUrl: withTimeout(wsUrl, 30_000, 'Chrome DevTools endpoint') };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chromePath = findChrome(args.chrome);
  const bundlePath = await buildBundle();
  const server = await startServer(bundlePath);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const profileDir = fs.mkdtempSync(path.join(TMP, 'profile-'));
  const { child, wsUrl } = launchChrome(chromePath, profileDir);

  let cdp;
  try {
    cdp = await Cdp.connect(await wsUrl);
    const browserVersion = await cdp.send('Browser.getVersion');

    // Network / console capture across the page and every worker it starts.
    let phase = 'setup';
    const sessionTypes = new Map();
    const requests = new Map();
    const consoleMessages = [];
    const attachErrors = [];

    cdp.on(async (m) => {
      const p = m.params ?? {};
      if (m.method === 'Target.attachedToTarget') {
        const child = p.sessionId;
        sessionTypes.set(child, p.targetInfo?.type ?? 'unknown');
        try {
          await cdp.send('Network.enable', {}, child);
          await cdp.send('Runtime.enable', {}, child);
          await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, child);
        } catch (err) {
          attachErrors.push(`${p.targetInfo?.type}: ${err.message}`);
        } finally {
          await cdp.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => {});
        }
      } else if (m.method === 'Network.requestWillBeSent') {
        const key = `${m.sessionId}:${p.requestId}`;
        if (!requests.has(key)) {
          requests.set(key, {
            phase,
            target: sessionTypes.get(m.sessionId) ?? 'unknown',
            method: p.request?.method,
            url: p.request?.url,
            kind: classifyUrl(p.request?.url ?? ''),
            outcome: 'no response recorded',
          });
        }
      } else if (m.method === 'Network.responseReceived') {
        const r = requests.get(`${m.sessionId}:${p.requestId}`);
        if (r) r.outcome = `HTTP ${p.response?.status}`;
      } else if (m.method === 'Network.loadingFailed') {
        const r = requests.get(`${m.sessionId}:${p.requestId}`);
        if (r) r.outcome = `failed: ${p.errorText}${p.blockedReason ? ` (${p.blockedReason})` : ''}`;
      } else if (m.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(p.type)) {
        consoleMessages.push({
          phase, target: sessionTypes.get(m.sessionId) ?? 'unknown', type: p.type,
          text: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500),
        });
      } else if (m.method === 'Runtime.exceptionThrown') {
        consoleMessages.push({
          phase, target: sessionTypes.get(m.sessionId) ?? 'unknown', type: 'exception',
          text: (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 500),
        });
      }
    });

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionTypes.set(page, 'page');
    await cdp.send('Network.enable', {}, page);
    await cdp.send('Runtime.enable', {}, page);
    await cdp.send('Page.enable', {}, page);
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, page);

    const evaluate = async (expression, what) => {
      const r = await withTimeout(
        cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page),
        STEP_TIMEOUT_MS, what);
      if (r.exceptionDetails) {
        throw new Error(`${what}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      }
      return r.result.value;
    };
    const runPhase = async (name, expression) => {
      phase = name;
      const value = await evaluate(expression, name);
      await sleep(PHASE_SETTLE_MS);
      return value;
    };

    phase = 'page-load';
    await cdp.send('Page.navigate', { url: `${baseUrl}/` }, page);
    const readyBy = Date.now() + 60_000;
    while (!(await evaluate('window.__engineCheckReady === true', 'page ready').catch(() => false))) {
      if (Date.now() > readyBy) throw new Error('harness page did not become ready');
      await sleep(200);
    }
    await sleep(PHASE_SETTLE_MS);

    const settings = await runPhase('read-settings', 'window.__engineCheck.settings()');
    const init = await runPhase('engine-init', 'window.__engineCheck.initStatus()');
    const selfTest = await runPhase('capture-self-test', 'window.__engineCheck.captureSelfTest()');

    const assets = [];
    for (const asset of ASSETS) {
      const bytes = fs.readFileSync(path.join(ASSET_DIR, asset.name));
      await runPhase(`load:${asset.name}`, `window.__engineCheck.load(${JSON.stringify(asset.name)}, ${JSON.stringify(asset.mimeType)})`);
      const result = await runPhase(`verify:${asset.name}`, `window.__engineCheck.verify(${JSON.stringify(asset.name)})`);
      assets.push({ ...asset, size: bytes.length, sha256: sha256(bytes), ...result });
    }
    phase = 'done';

    // ── Checks ────────────────────────────────────────────────────────────
    const allRequests = [...requests.values()];
    const verifyRequests = (name) => allRequests.filter((r) => r.phase === `verify:${name}`);
    const settingsSummary = summarizeSettings(settings);
    const checks = [];
    const check = (id, result, detail) => checks.push({ id, result, detail });

    const canary = allRequests.filter((r) => r.url?.includes(selfTest.host));
    check('network-capture-self-test',
      canary.some((r) => r.target === 'worker') ? 'PASS' : 'FAIL',
      canary.length
        ? `recorded ${canary.length} request(s) to ${selfTest.host} from: ${canary.map((r) => r.target).join(', ')}; worker saw "${selfTest.outcome}"`
        : `request to ${selfTest.host} from a Web Worker was NOT recorded (worker saw "${selfTest.outcome}") — network results below cannot be trusted`);

    check('engine-settings-applied',
      init.settingsApplied ? 'PASS' : 'FAIL',
      init.settingsApplied
        ? 'createC2pa() accepted ENGINE_SETTINGS'
        : `createC2pa() rejected ENGINE_SETTINGS and fell back to SDK defaults: ${init.fallbackError}`);

    const anchorEntries = Object.entries({
      'trust.trustAnchors': settingsSummary.trust.trustAnchors,
      'trust.userAnchors': settingsSummary.trust.userAnchors,
    }).filter(([, v]) => v);
    if (anchorEntries.length === 0) {
      check('trust-anchors', 'N/A', 'no trust.trustAnchors or trust.userAnchors in ENGINE_SETTINGS — no C2PA signer can be trusted');
    } else {
      const badForm = anchorEntries.filter(([, v]) => v.form !== 'pem-string' || v.certificates === 0);
      const trustedAssets = assets.filter((a) => validationCodes(a.raw).success.includes('signingCredential.trusted'));
      if (badForm.length) {
        check('trust-anchors', 'FAIL', `must be ONE PEM string (the SDK fetches URLs and array items): ${badForm.map(([k, v]) => `${k} is ${v.form}`).join('; ')}`);
      } else if (trustedAssets.length === 0) {
        check('trust-anchors', 'FAIL', `anchors are configured (${anchorEntries.map(([k, v]) => `${k}: ${v.certificates} certificates`).join('; ')}) but NO asset reported signingCredential.trusted — the anchors are not active`);
      } else {
        check('trust-anchors', 'PASS', `${anchorEntries.map(([k, v]) => `${k}: one PEM string, ${v.certificates} certificates`).join('; ')}; signingCredential.trusted on: ${trustedAssets.map((a) => a.name).join(', ')}`);
      }
    }

    if (settings?.verify?.remoteManifestFetch === false) {
      const leaks = allRequests.filter((r) => r.kind === 'outbound' && (r.phase === 'engine-init' || r.phase.startsWith('verify:')));
      check('remote-manifests-local',
        leaks.length === 0 ? 'PASS' : 'FAIL',
        leaks.length === 0
          ? 'verify.remoteManifestFetch=false and no outbound request during engine init or any verification'
          : `verify.remoteManifestFetch=false but outbound requests were made: ${leaks.map((r) => `${r.phase} ${r.url}`).join('; ')}`);
    } else {
      check('remote-manifests-local', 'N/A', 'verify.remoteManifestFetch is not set to false (SDK default applies)');
    }

    // ── Report ────────────────────────────────────────────────────────────
    const engineDirty = git('status', '--porcelain', '--untracked-files=no', '--',
      'extension', 'package.json', 'package-lock.json', 'tests/engine');
    const c2paWebVersion = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'node_modules', '@contentauth', 'c2pa-web', 'package.json'), 'utf8')).version;

    const report = {
      label: args.label,
      generatedAt: new Date().toISOString(),
      environment: {
        commit: git('rev-parse', 'HEAD'),
        engineFilesModifiedSinceCommit: engineDirty ? engineDirty.split('\n') : [],
        c2paWeb: c2paWebVersion,
        chrome: browserVersion.product,
        node: process.version,
        os: `${os.type()} ${os.release()} ${os.arch()}`,
      },
      engineSettings: settingsSummary,
      engineInit: init,
      checks,
      captureSelfTest: { ...selfTest, recorded: canary },
      assets: assets.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        sha256: a.sha256,
        finalState: a.status,
        error: a.error,
        durationMs: a.durationMs,
        validationState: a.raw?.validation_state ?? null,
        codes: validationCodes(a.raw),
        manifestSummary: a.manifest
          ? { signer: a.manifest.signer, tsa_info: a.manifest.tsa_info, validity_window: a.manifest.validity_window, contentCategory: a.manifest.contentCategory }
          : null,
        requestsDuringVerification: verifyRequests(a.name),
        raw: a.raw,
      })),
      otherRequests: allRequests.filter((r) => !r.phase.startsWith('verify:')),
      consoleWarningsAndErrors: consoleMessages,
      attachErrors,
    };

    const failed = checks.filter((c) => c.result === 'FAIL');
    printSummary(report);
    if (args.out) {
      const outDir = path.resolve(ROOT, args.out);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
      fs.writeFileSync(path.join(outDir, 'README.md'), renderMarkdown(report));
      console.log(`\n[engine-check] wrote ${path.relative(ROOT, outDir)}/results.json and README.md`);
    }
    if (failed.length) {
      console.error(`\n[engine-check] FAIL: ${failed.map((c) => c.id).join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('\n[engine-check] all checks passed (or N/A)');
    }
  } finally {
    if (cdp) {
      await withTimeout(cdp.send('Browser.close'), 5000, 'Browser.close').catch(() => {});
      cdp.close();
    }
    await sleep(1000);
    if (child.exitCode === null) child.kill();
    server.close();
    if (!args.keepProfile) {
      // Only the profile directory this run created, inside the working tree.
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  }
}

// ── Output ──────────────────────────────────────────────────────────────────

function printSummary(report) {
  console.log(`[engine-check] ${report.label ?? '(no label)'} — c2pa-web ${report.environment.c2paWeb}, ${report.environment.chrome}`);
  for (const c of report.checks) console.log(`  ${c.result.padEnd(4)} ${c.id}: ${c.detail}`);
  for (const a of report.assets) {
    const out = a.requestsDuringVerification.filter((r) => r.kind === 'outbound');
    console.log(`  ${a.name.padEnd(16)} ${String(a.finalState).padEnd(20)} state=${a.validationState ?? '-'} outbound=${out.length}`);
  }
}

function renderMarkdown(r) {
  const lines = [];
  const codeList = (xs) => (xs.length ? xs.map((x) => `\`${x}\``).join(', ') : '—');
  lines.push(`# Engine-level check — ${r.label}`, '');
  lines.push('Generated by `node tests/engine/run.mjs` (see `tests/engine/README.md`). Do not edit by hand;',
    're-run the harness instead. Full data, including the raw SDK validation result for each asset, is in',
    '`results.json`.', '');
  lines.push('## Environment', '');
  lines.push(`| Item | Value |`, `|---|---|`);
  lines.push(`| Generated | ${r.generatedAt} |`);
  lines.push(`| Commit | \`${r.environment.commit}\` |`);
  lines.push(`| Engine files modified since commit | ${r.environment.engineFilesModifiedSinceCommit.length ? r.environment.engineFilesModifiedSinceCommit.map((x) => `\`${x}\``).join(', ') : 'none'} |`);
  lines.push(`| c2pa-web | ${r.environment.c2paWeb} |`);
  lines.push(`| Browser | ${r.environment.chrome} (headless) |`);
  lines.push(`| Node | ${r.environment.node} |`);
  lines.push(`| OS | ${r.environment.os} |`, '');
  lines.push('## Engine settings', '');
  lines.push('```json', JSON.stringify(r.engineSettings, null, 2), '```', '');
  lines.push(`Engine initialisation: ${r.engineInit.settingsApplied ? 'ENGINE_SETTINGS accepted' : `FELL BACK to SDK defaults — ${r.engineInit.fallbackError}`}.`, '');
  lines.push('## Checks', '');
  lines.push('| Check | Result | Detail |', '|---|---|---|');
  for (const c of r.checks) lines.push(`| ${c.id} | **${c.result}** | ${c.detail.replace(/\|/g, '\\|')} |`);
  lines.push('');
  lines.push('## Results per asset', '');
  lines.push('| Asset | Final state | SDK validation_state | Outbound requests during verification |', '|---|---|---|---|');
  for (const a of r.assets) {
    const out = a.requestsDuringVerification.filter((x) => x.kind === 'outbound');
    lines.push(`| \`${a.name}\` | \`${a.finalState}\` | ${a.validationState ?? '—'} | ${out.length ? out.map((x) => `${x.method} ${x.url} → ${x.outcome}`).join('<br>') : 'none'} |`);
  }
  lines.push('');
  lines.push('## Validation codes per asset', '');
  for (const a of r.assets) {
    lines.push(`### \`${a.name}\``, '');
    lines.push(`- File: ${a.size} bytes, SHA-256 \`${a.sha256}\``);
    lines.push(`- Final state: \`${a.finalState}\`${a.error ? ` (error: ${a.error.message})` : ''}; verification took ${a.durationMs} ms`);
    if (a.manifestSummary?.signer) lines.push(`- Signer: ${a.manifestSummary.signer.common_name} (issuer: ${a.manifestSummary.signer.issuer ?? '—'})`);
    lines.push(`- success: ${codeList(a.codes.success)}`);
    lines.push(`- informational: ${codeList(a.codes.informational)}`);
    lines.push(`- failure: ${codeList(a.codes.failure)}`);
    lines.push(`- validation_status: ${codeList(a.codes.validation_status)}`);
    const reqs = a.requestsDuringVerification;
    lines.push(`- Requests during verification: ${reqs.length ? '' : 'none'}`);
    for (const x of reqs) lines.push(`  - [${x.kind}, ${x.target}] ${x.method} ${x.url} → ${x.outcome}`);
    lines.push('');
  }
  lines.push('## Other recorded requests (outside verification phases)', '');
  if (r.otherRequests.length === 0) lines.push('None.');
  for (const x of r.otherRequests) lines.push(`- ${x.phase} [${x.kind}, ${x.target}] ${x.method} ${x.url} → ${x.outcome}`);
  lines.push('');
  if (r.consoleWarningsAndErrors.length) {
    lines.push('## Console warnings and errors', '');
    for (const c of r.consoleWarningsAndErrors) lines.push(`- ${c.phase} [${c.target}] ${c.type}: ${c.text.replace(/\n/g, ' ')}`);
    lines.push('');
  }
  if (r.attachErrors.length) {
    lines.push('## DevTools attach errors', '');
    for (const e of r.attachErrors) lines.push(`- ${e}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error(`[engine-check] harness error: ${err.stack ?? err}`);
  process.exitCode = 2;
});
