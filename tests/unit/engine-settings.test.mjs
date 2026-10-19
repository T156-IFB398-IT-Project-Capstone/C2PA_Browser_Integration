// Engine configuration in offscreen.js: the bundled trust anchors and the
// "no silent fallback" rule. The SDK is the stand-in, so these tests check what
// the engine is GIVEN; what the real engine DOES with it is shown by the
// engine-level check (tests/engine/run.mjs, docs/phase2/engine-check/).
//
// Own test file (own process): the initialisation-failure case needs a fresh
// offscreen.js module whose SDK singleton has not been created yet.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installChromeStub, listeners } from './helpers/chrome-stub.mjs';
import { repoUrl } from './helpers/fixtures.mjs';

register('./helpers/fake-sdk-hooks.mjs', import.meta.url);
installChromeStub();

const fakeSdk = await import('./helpers/fake-c2pa-web.mjs');
const { ENGINE_SETTINGS, TRUST_ANCHORS_PEM, engineInitStatus } =
  await import(repoUrl('extension/src/offscreen/offscreen.js'));
const { MSG } = await import(repoUrl('extension/src/shared/messages.js'));

const TRUST_DIR = 'trust-lists/c2pa-conformance/';
const source = JSON.parse(readFileSync(new URL(repoUrl(`${TRUST_DIR}SOURCE.json`)), 'utf8'));
const certCount = (pem) => (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;

describe('bundled trust lists match their recorded source', () => {
  for (const [name, meta] of Object.entries(source.files)) {
    test(`${name}: SHA-256, size and certificate count as in SOURCE.json`, () => {
      const bytes = readFileSync(new URL(repoUrl(TRUST_DIR + name)));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
      assert.equal(bytes.length, meta.bytes);
      assert.equal(certCount(bytes.toString('utf8')), meta.certificates);
    });
  }

  test('every bundled certificate parses as X.509 and is a CA certificate', () => {
    const blocks = TRUST_ANCHORS_PEM.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    for (const block of blocks) assert.equal(new X509Certificate(block).ca, true);
  });
});

describe('ENGINE_SETTINGS', () => {
  const anchors = ENGINE_SETTINGS.trust?.trustAnchors;

  test('trust.trustAnchors is ONE PEM string (the SDK fetches URLs and array items)', () => {
    assert.equal(typeof anchors, 'string');
    assert.equal(anchors.startsWith('http'), false);
    assert.equal(anchors, TRUST_ANCHORS_PEM);
  });

  test('trust.trustAnchors holds both lists: C2PA Trust List + C2PA TSA Trust List', () => {
    const expected = Object.values(source.files).reduce((n, f) => n + f.certificates, 0);
    assert.equal(certCount(anchors), expected);
  });

  test('no other trust or CAWG setting points at a URL', () => {
    const urls = JSON.stringify(ENGINE_SETTINGS).match(/https?:\/\//g);
    assert.equal(urls, null);
  });
});

describe('engine initialisation (no silent fallback)', () => {
  const [listener] = listeners['runtime.onMessage'] ?? [];
  const send = (payload) => new Promise((resolve) => {
    listener({ type: MSG.VERIFY_REQUEST, payload }, {}, resolve);
  });

  test('settings rejected -> error result, and createC2pa() is never called without settings', async () => {
    fakeSdk.setInitError(new Error('bad trust settings'));
    const res = await send({ bytes: [0xff, 0xd8], mimeType: 'image/jpeg' });
    assert.equal(res.status, 'error');
    assert.match(res.error.message, /could not start with its settings: bad trust settings/);
    assert.equal(res.manifest, null);
    assert.equal(fakeSdk.calls.createC2pa, 1);
    assert.equal(fakeSdk.calls.settings[0], ENGINE_SETTINGS);
  });

  test('the next request retries initialisation with the same settings', async () => {
    fakeSdk.setStore(null);
    const res = await send({ bytes: [0xff, 0xd8], mimeType: 'image/jpeg' });
    assert.equal(res.status, 'no_credentials');
    assert.equal(fakeSdk.calls.createC2pa, 2);
    assert.equal(fakeSdk.calls.settings[1], ENGINE_SETTINGS);
    assert.deepEqual(await engineInitStatus(), { settingsApplied: true, error: null });
  });
});
