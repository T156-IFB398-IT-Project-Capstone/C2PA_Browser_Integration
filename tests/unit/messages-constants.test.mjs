// shared/messages.js and shared/constants.js — the message contract and the
// values the classic content script has to copy by hand.

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MSG, msg } from '../../extension/src/shared/messages.js';
import {
  VERIFY_STATUS, SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS, STORAGE_KEYS,
} from '../../extension/src/shared/constants.js';
import { REPO_ROOT } from './helpers/fixtures.mjs';

describe('messages', () => {
  test('every MSG value is unique and namespaced c2pa/', () => {
    const values = Object.values(MSG);
    assert.equal(new Set(values).size, values.length);
    for (const v of values) assert.match(v, /^c2pa\/[a-z_]+$/);
  });

  test('msg() builds { type, payload, ts }', () => {
    const now = mock.method(Date, 'now', () => 1234);
    try {
      assert.deepEqual(msg(MSG.SCAN_ACTIVE_TAB, { a: 1 }), { type: MSG.SCAN_ACTIVE_TAB, payload: { a: 1 }, ts: 1234 });
      assert.deepEqual(msg(MSG.GET_TAB_MEDIA), { type: MSG.GET_TAB_MEDIA, payload: {}, ts: 1234 });
    } finally {
      now.mock.restore();
    }
  });

  test('MSG is frozen', () => assert.ok(Object.isFrozen(MSG)));
});

describe('constants', () => {
  test('VERIFY_STATUS values are unique', () => {
    const values = Object.values(VERIFY_STATUS);
    assert.equal(new Set(values).size, values.length);
  });

  test('STORAGE_KEYS values are unique', () => {
    const values = Object.values(STORAGE_KEYS);
    assert.equal(new Set(values).size, values.length);
  });

  test('supported MIME types and extensions', () => {
    assert.equal(SUPPORTED_MIME_TYPES.length, 5);
    assert.deepEqual([...SUPPORTED_EXTENSIONS].sort(), ['.gif', '.jpeg', '.jpg', '.mp4', '.png', '.webp']);
  });

  // content-script.js is a classic script and cannot import constants.js, so it
  // keeps hand-copied values. These checks read its source to catch drift.
  describe('content-script.js inlined copies stay in sync', () => {
    const src = fs.readFileSync(new URL('extension/src/content/content-script.js', REPO_ROOT), 'utf8');

    test('SUPPORTED_EXTENSIONS', () => {
      const m = src.match(/const SUPPORTED_EXTENSIONS\s*=\s*\[([^\]]*)\]/);
      assert.ok(m, 'SUPPORTED_EXTENSIONS not found in content-script.js');
      const inlined = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      assert.deepEqual(inlined, [...SUPPORTED_EXTENSIONS]);
    });

    for (const key of ['MEDIA_DETECTED', 'SCAN_ACTIVE_TAB', 'SCAN_COMPLETE', 'SCROLL_TO_MEDIA']) {
      test(`MSG_${key}`, () => {
        const m = src.match(new RegExp(`const MSG_${key}\\s*=\\s*'([^']+)'`));
        assert.ok(m, `MSG_${key} not found in content-script.js`);
        assert.equal(m[1], MSG[key]);
      });
    }
  });
});
