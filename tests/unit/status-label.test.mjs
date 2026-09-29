// shared/status-label.js — status wording shared by popup and detail page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusToLabel } from '../../extension/src/shared/status-label.js';
import { VERIFY_STATUS as S } from '../../extension/src/shared/constants.js';

const LABELS = {
  [S.VERIFIED_TRUSTED]:   'Verified — trusted',
  [S.VERIFIED_TSA]:       'Verified via TSA',
  [S.VERIFIED_UNTRUSTED]: 'Signed — provider not in trust list',
  [S.SIGNING_EXPIRED]:    'Expired (No TSA)',
  [S.CONTENT_TAMPERED]:   'Content tampered',
  [S.BROKEN_SIGNATURE]:   'Broken signature',
  [S.INVALID_OR_CHANGED]: 'Invalid or changed',
  [S.NO_CREDENTIALS]:     'No Content Credentials',
  [S.UNSUPPORTED_FORMAT]: 'Format not supported',
  error:                  'Error',
};

test('every VERIFY_STATUS has a label (plus error)', () => {
  assert.deepEqual(Object.keys(LABELS).sort(), [...Object.values(S), 'error'].sort());
  for (const [status, label] of Object.entries(LABELS)) {
    assert.equal(statusToLabel(status), label, status);
  }
});

test('unknown status is shown raw; null/undefined -> Unknown', () => {
  assert.equal(statusToLabel('something_new'), 'something_new');
  assert.equal(statusToLabel(null), 'Unknown');
  assert.equal(statusToLabel(undefined), 'Unknown');
});

test('no label makes a truth claim (hard constraint #4)', () => {
  for (const label of Object.values(LABELS)) {
    assert.doesNotMatch(label, /\b(fake|real|genuine|safe|true|false|authentic)\b/i, label);
  }
});
