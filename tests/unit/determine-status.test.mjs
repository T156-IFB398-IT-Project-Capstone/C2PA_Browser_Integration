// determineStatus(): manifest store -> VERIFY_STATUS.
// Supersedes the cases in scripts/test-status-mapping.mjs (kept for reference).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { determineStatus } from '../../extension/src/offscreen/offscreen.js';
import { VERIFY_STATUS as S } from '../../extension/src/shared/constants.js';
import { loadManifest, syntheticStore } from './helpers/fixtures.mjs';

const EXPIRED   = { code: 'signingCredential.expired', explanation: 'certificate expired' };
const TSA_OK    = { code: 'timeStamp.validated', explanation: 'timestamp message digest matched' };
const HASH_BAD  = { code: 'assertion.dataHash.mismatch', explanation: 'data hash invalid' };
const SIG_BAD   = { code: 'claimSignature.mismatch', explanation: 'claim signature invalid' };

describe('determineStatus — real pre-extracted manifests', () => {
  const expected = {
    car:           S.VERIFIED_TSA,
    ChatGPTgen:    S.VERIFIED_UNTRUSTED,
    cloudscape:    S.VERIFIED_TSA,
    'crater-lake': S.VERIFIED_TSA,
    'Firefly-cat': S.VERIFIED_TSA,
    sora:          S.VERIFIED_TSA,
  };
  for (const [name, status] of Object.entries(expected)) {
    test(`manifest-${name} -> ${status}`, () => {
      assert.equal(determineStatus(loadManifest(name)), status);
    });
  }
});

describe('determineStatus — no manifest', () => {
  test('null store -> no_credentials', () => assert.equal(determineStatus(null), S.NO_CREDENTIALS));
  test('undefined store -> no_credentials', () => assert.equal(determineStatus(undefined), S.NO_CREDENTIALS));
  test('store without active_manifest -> no_credentials', () => {
    assert.equal(determineStatus({ validation_state: 'Valid', manifests: {} }), S.NO_CREDENTIALS);
  });
});

describe('determineStatus — synthetic stores (one branch each)', () => {
  test('Trusted -> verified_trusted (SYNTHETIC — not a real trusted asset)', () => {
    assert.equal(determineStatus(syntheticStore('Trusted')), S.VERIFIED_TRUSTED);
  });

  test('Valid, no failures -> verified_untrusted', () => {
    assert.equal(determineStatus(syntheticStore('Valid')), S.VERIFIED_UNTRUSTED);
  });

  test('Valid with empty validation_status and no validation_results -> verified_untrusted', () => {
    assert.equal(
      determineStatus({ active_manifest: 'm', validation_state: 'Valid', validation_status: [] }),
      S.VERIFIED_UNTRUSTED,
    );
  });

  test('Valid + TSA success -> verified_tsa', () => {
    assert.equal(determineStatus(syntheticStore('Valid', { success: [TSA_OK] })), S.VERIFIED_TSA);
  });

  test('TSA success recognised by explanation text alone', () => {
    const store = syntheticStore('Valid', { success: [{ explanation: 'timestamp message digest matched' }] });
    assert.equal(determineStatus(store), S.VERIFIED_TSA);
  });

  test('Trusted + TSA success (cert not expired) stays verified_trusted', () => {
    assert.equal(determineStatus(syntheticStore('Trusted', { success: [TSA_OK] })), S.VERIFIED_TRUSTED);
  });

  test('Valid + expired cert, no TSA -> signing_expired', () => {
    assert.equal(determineStatus(syntheticStore('Valid', { failure: [EXPIRED] })), S.SIGNING_EXPIRED);
  });

  test('signingCredential.outsideValidity counts as expired', () => {
    const store = syntheticStore('Valid', { failure: [{ code: 'signingCredential.outsideValidity' }] });
    assert.equal(determineStatus(store), S.SIGNING_EXPIRED);
  });

  test('Valid + expired cert + TSA success -> verified_tsa', () => {
    const store = syntheticStore('Valid', { failure: [EXPIRED], success: [TSA_OK] });
    assert.equal(determineStatus(store), S.VERIFIED_TSA);
  });

  test('expired cert outranks Trusted when there is no TSA', () => {
    assert.equal(determineStatus(syntheticStore('Trusted', { failure: [EXPIRED] })), S.SIGNING_EXPIRED);
  });

  test('Invalid + data hash mismatch -> content_tampered', () => {
    assert.equal(determineStatus(syntheticStore('Invalid', { failure: [HASH_BAD] })), S.CONTENT_TAMPERED);
  });

  test('tamper code in the flat validation_status list is also seen', () => {
    const store = syntheticStore('Invalid', { status: [{ code: 'assertion.hashedURI.mismatch' }] });
    assert.equal(determineStatus(store), S.CONTENT_TAMPERED);
  });

  test('Invalid + claim signature mismatch -> broken_signature', () => {
    assert.equal(determineStatus(syntheticStore('Invalid', { failure: [SIG_BAD] })), S.BROKEN_SIGNATURE);
  });

  test('tampered outranks broken signature when both are reported', () => {
    const store = syntheticStore('Invalid', { failure: [SIG_BAD, HASH_BAD] });
    assert.equal(determineStatus(store), S.CONTENT_TAMPERED);
  });

  test('Invalid with no recognised failure code -> invalid_or_changed', () => {
    const store = syntheticStore('Invalid', { failure: [{ code: 'some.future.code' }] });
    assert.equal(determineStatus(store), S.INVALID_OR_CHANGED);
  });

  test('failure codes are ignored unless the state is Invalid', () => {
    // A hash-mismatch code on a Valid store does not make it tampered;
    // validation_state gates the tamper/broken branches.
    assert.equal(determineStatus(syntheticStore('Valid', { failure: [HASH_BAD] })), S.VERIFIED_UNTRUSTED);
  });

  test('missing or unknown validation_state -> invalid_or_changed', () => {
    assert.equal(determineStatus(syntheticStore(null)), S.INVALID_OR_CHANGED);
    assert.equal(determineStatus(syntheticStore('Something')), S.INVALID_OR_CHANGED);
  });

  // When the Invalid + TSA policy (finding-001) is decided, THIS TEST MUST BE
  // UPDATED to the new expected status, together with determineStatus().
  test('KNOWN ISSUE finding-001: expired cert + valid TSA + Invalid reads invalid_or_changed', () => {
    const store = syntheticStore('Invalid', { failure: [EXPIRED], success: [TSA_OK] });
    assert.equal(determineStatus(store), S.INVALID_OR_CHANGED);
  });
});

describe('determineStatus — coverage of VERIFY_STATUS', () => {
  test('every status except unsupported_format is reachable from determineStatus', () => {
    // unsupported_format is assigned by the service worker (verifyOne) when the
    // fetched MIME type is unsupported; determineStatus never returns it.
    const stores = [
      null,
      syntheticStore('Trusted'),
      syntheticStore('Valid'),
      syntheticStore('Valid', { success: [TSA_OK] }),
      syntheticStore('Valid', { failure: [EXPIRED] }),
      syntheticStore('Invalid', { failure: [HASH_BAD] }),
      syntheticStore('Invalid', { failure: [SIG_BAD] }),
      syntheticStore('Invalid'),
    ];
    const reached = new Set(stores.map(determineStatus));
    const expected = Object.values(S).filter((s) => s !== S.UNSUPPORTED_FORMAT);
    assert.deepEqual([...reached].sort(), expected.sort());
  });
});
