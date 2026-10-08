// The real verify() and its private helpers (extractManifest, analyzeActions)
// run against pre-extracted manifest JSON. '@contentauth/c2pa-web/inline' is
// redirected to helpers/fake-c2pa-web.mjs, so no WASM or Worker is started and
// offscreen.js is imported unmodified.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { installChromeStub, listeners } from './helpers/chrome-stub.mjs';
import { loadManifest, repoUrl, actionsAssertion, IPTC } from './helpers/fixtures.mjs';

register('./helpers/fake-sdk-hooks.mjs', import.meta.url);
installChromeStub(); // offscreen.js registers its onMessage listener only if `chrome` exists

const fakeSdk = await import('./helpers/fake-c2pa-web.mjs');
const { verify } = await import(repoUrl('extension/src/offscreen/offscreen.js'));
const { pickBadgeState } = await import(repoUrl('extension/src/shared/badge-map.js'));
const { VERIFY_STATUS: S } = await import(repoUrl('extension/src/shared/constants.js'));
const { MSG } = await import(repoUrl('extension/src/shared/messages.js'));

async function verifyStore(store, mimeType = 'image/jpeg') {
  fakeSdk.setStore(store);
  return verify({ bytes: [0xff, 0xd8], mimeType });
}

/** One-manifest store whose active manifest carries `actions`. */
const storeWithActions = (actions) => ({
  active_manifest: 'm', validation_state: 'Valid',
  manifests: { m: { assertions: [actionsAssertion(actions)] } },
});

describe('verify() with a stand-in SDK', () => {
  test('uses the stand-in, never the real SDK', async () => {
    await verifyStore(null);
    assert.equal(fakeSdk.calls.createC2pa, 1);
  });

  test('no reader (no manifest) -> no_credentials, null manifest', async () => {
    const res = await verifyStore(null);
    assert.equal(res.status, S.NO_CREDENTIALS);
    assert.equal(res.manifest, null);
    assert.equal(res.error, null);
  });

  test('passes the MIME type through to the SDK reader', async () => {
    await verifyStore(loadManifest('sora'), 'video/mp4');
    assert.equal(fakeSdk.calls.fromBlob.at(-1).mimeType, 'video/mp4');
  });

  test('manifest summary has exactly the fields the UI consumes', async () => {
    const { manifest } = await verifyStore(loadManifest('car'));
    assert.deepEqual(Object.keys(manifest).sort(), [
      'ai_disclosure', 'ai_source_type', 'contentCategory', 'contentHistory',
      'creator', 'has_non_ai_edit', 'signer', 'tsa_info', 'validity_window',
    ]);
    // No `validity` key (extractValidity() is dead code). popup.js now reads
    // validity_window / tsa_info instead. See docs/phase2/ui-bug-proposals.md P1.
    assert.equal('validity' in manifest, false);
  });

  test('manifest-car: signer, TSA and edit history are extracted', async () => {
    const { status, manifest } = await verifyStore(loadManifest('car'));
    assert.equal(status, S.VERIFIED_TSA);
    assert.equal(typeof manifest.signer.common_name, 'string');
    assert.equal(manifest.tsa_info.validated, true);
    assert.equal(manifest.has_non_ai_edit, true);
    assert.equal(manifest.ai_disclosure, false);
    assert.equal(manifest.contentCategory, 'edited');
  });

  test('manifest-Firefly-cat: AI generation in the active manifest is found by both detectors', async () => {
    const { manifest } = await verifyStore(loadManifest('Firefly-cat'));
    assert.equal(manifest.ai_disclosure, true);
    assert.equal(manifest.ai_source_type, 'generated');
    assert.equal(manifest.contentCategory, 'ai_generated');
  });
});

describe('analyzeActions (via verify)', () => {
  test('no actions -> no disclosure, no edit', async () => {
    const { manifest } = await verifyStore(storeWithActions([]));
    assert.deepEqual(
      [manifest.ai_disclosure, manifest.ai_source_type, manifest.has_non_ai_edit],
      [false, null, false],
    );
  });

  test('created + opened -> not an edit', async () => {
    const { manifest } = await verifyStore(storeWithActions([{ action: 'c2pa.created' }, { action: 'c2pa.opened' }]));
    assert.equal(manifest.has_non_ai_edit, false);
  });

  test('composite -> ai_source_type composite; generated outranks composite', async () => {
    const composite = { action: 'c2pa.edited', digitalSourceType: IPTC + 'compositeWithTrainedAlgorithmicMedia' };
    const generated = { action: 'c2pa.created', digitalSourceType: IPTC + 'trainedAlgorithmicMedia' };
    assert.equal((await verifyStore(storeWithActions([composite]))).manifest.ai_source_type, 'composite');
    assert.equal((await verifyStore(storeWithActions([generated, composite]))).manifest.ai_source_type, 'generated');
  });

  // Was a KNOWN ISSUE before WI-2: analyzeActions had its own non-edit set
  // without c2pa.published. Both detectors now share one set.
  test('c2pa.published is not an edit for the popup or the in-page badge', async () => {
    const { manifest } = await verifyStore(storeWithActions([{ action: 'c2pa.created' }, { action: 'c2pa.published' }]));
    assert.equal(manifest.has_non_ai_edit, false);
    assert.equal(manifest.contentCategory, 'authentic');
  });
});

describe('popup Shield vs in-page category', () => {
  // ChatGPTgen.png: the active manifest only says "c2pa.opened"; the AI
  // generation is declared on its ingredient. Before WI-2 the popup Shield
  // read the active manifest only and showed "authentic" for this AI-generated
  // image. Both detectors now walk the ingredient chain.
  test('ChatGPTgen — AI generation declared on an ingredient reaches the popup Shield fields', async () => {
    const result = await verifyStore(loadManifest('ChatGPTgen'), 'image/png');
    assert.equal(result.manifest.ai_disclosure, true);
    assert.equal(result.manifest.ai_source_type, 'generated');
    assert.equal(pickBadgeState(result), 'ai_generated');
    assert.equal(result.manifest.contentCategory, 'ai_generated');
  });

  test('ChatGPTgen — popup Shield and in-page category agree (WI-2 detector unification)', async () => {
    const result = await verifyStore(loadManifest('ChatGPTgen'), 'image/png');
    assert.equal(pickBadgeState(result), 'ai_generated');
  });
});

describe('offscreen onMessage listener', () => {
  const [listener] = listeners['runtime.onMessage'] ?? [];

  const send = (payload) => new Promise((resolve) => {
    const keepOpen = listener({ type: MSG.VERIFY_REQUEST, payload }, {}, resolve);
    assert.equal(keepOpen, true);
  });

  test('is registered when chrome.runtime exists', () => {
    assert.equal(typeof listener, 'function');
  });

  test('ignores other message types', () => {
    assert.equal(listener({ type: MSG.SCAN_ACTIVE_TAB }, {}, () => {}), false);
  });

  test('SDK UnsupportedType error -> no_credentials with no error', async () => {
    fakeSdk.setError(new Error('UnsupportedType: image/x-foo'));
    assert.deepEqual(await send({ bytes: [1], mimeType: 'image/x-foo' }), {
      status: S.NO_CREDENTIALS, manifest: null, error: null,
    });
  });

  test('any other SDK error -> error with its message', async () => {
    fakeSdk.setError(new Error('boom'));
    assert.deepEqual(await send({ bytes: [1], mimeType: 'image/jpeg' }), {
      status: 'error', manifest: null, error: { message: 'boom' },
    });
  });
});
