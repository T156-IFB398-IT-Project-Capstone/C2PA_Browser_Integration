// shared/badge-map.js — popup / detail / test-bench Shield badge selection.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickBadgeState, BADGE_ELIGIBLE_STATUSES, BADGE_FILES } from '../../extension/src/shared/badge-map.js';
import { VERIFY_STATUS as S } from '../../extension/src/shared/constants.js';

const plain = { ai_source_type: null, has_non_ai_edit: false };

describe('pickBadgeState', () => {
  test('exactly the four intact statuses are badge-eligible', () => {
    assert.deepEqual(
      [...BADGE_ELIGIBLE_STATUSES].sort(),
      [S.VERIFIED_TRUSTED, S.VERIFIED_TSA, S.VERIFIED_UNTRUSTED, S.SIGNING_EXPIRED].sort(),
    );
  });

  for (const status of [S.VERIFIED_TRUSTED, S.VERIFIED_TSA, S.VERIFIED_UNTRUSTED, S.SIGNING_EXPIRED]) {
    test(`${status} with a manifest gets a badge`, () => {
      assert.equal(pickBadgeState({ status, manifest: plain }), 'authentic');
    });
  }

  // Constraint #4: never force an "authentic"-family badge onto a failed or
  // absent result — even when the manifest claims AI generation.
  for (const status of [S.CONTENT_TAMPERED, S.BROKEN_SIGNATURE, S.INVALID_OR_CHANGED,
    S.NO_CREDENTIALS, S.UNSUPPORTED_FORMAT, 'error']) {
    test(`${status} -> no badge`, () => {
      assert.equal(pickBadgeState({ status, manifest: plain }), null);
      assert.equal(pickBadgeState({ status, manifest: { ...plain, ai_source_type: 'generated' } }), null);
    });
  }

  test('eligible status with a null manifest -> no badge', () => {
    assert.equal(pickBadgeState({ status: S.VERIFIED_TSA, manifest: null }), null);
  });

  test('state mapping: generated > composite > non-AI edit > authentic', () => {
    const pick = (manifest) => pickBadgeState({ status: S.VERIFIED_TSA, manifest });
    assert.equal(pick({ ai_source_type: 'generated', has_non_ai_edit: true }), 'ai_generated');
    assert.equal(pick({ ai_source_type: 'composite', has_non_ai_edit: true }), 'ai_edited');
    assert.equal(pick({ ai_source_type: null, has_non_ai_edit: true }), 'authentic_edited');
    assert.equal(pick(plain), 'authentic');
  });

  test('every state has a badge file and alt text', () => {
    for (const state of ['authentic', 'authentic_edited', 'ai_edited', 'ai_generated']) {
      assert.match(BADGE_FILES[state].file, /\.svg$/);
      assert.ok(BADGE_FILES[state].alt);
    }
  });
});
