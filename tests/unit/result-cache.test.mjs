// shared/result-cache.js — in-memory verification result cache.
//
// The "bypass on manual scan" behaviour lives in service-worker.js
// (verifyOne(url, bypassCache)), which is not exported, so it is not tested
// here. ResultCache itself has no bypass flag.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ResultCache } from '../../extension/src/shared/result-cache.js';
import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from '../../extension/src/shared/constants.js';
import { useClock } from './helpers/clock.mjs';

describe('ResultCache', () => {
  test('defaults come from constants.js', () => {
    const cache = new ResultCache();
    assert.equal(cache._ttl, CACHE_TTL_MS);
    assert.equal(cache._max, CACHE_MAX_ENTRIES);
  });

  test('get/has/size/clear', () => {
    const cache = new ResultCache();
    assert.equal(cache.get('a'), null);
    cache.set('a', { status: 'x' });
    assert.deepEqual(cache.get('a'), { status: 'x' });
    assert.equal(cache.has('a'), true);
    assert.equal(cache.size, 1);
    cache.clear();
    assert.equal(cache.size, 0);
  });

  test('entry is served up to the TTL and dropped after it', (t) => {
    const clock = useClock(t);
    const cache = new ResultCache({ ttl: 1_000 });
    cache.set('a', 1);
    clock.advance(1_000);
    assert.equal(cache.get('a'), 1, 'exactly at TTL is still fresh');
    clock.advance(1);
    assert.equal(cache.get('a'), null);
    assert.equal(cache.size, 0, 'stale entry is deleted on read');
  });

  test('re-setting a key refreshes its timestamp', (t) => {
    const clock = useClock(t);
    const cache = new ResultCache({ ttl: 1_000 });
    cache.set('a', 1);
    clock.advance(900);
    cache.set('a', 2);
    clock.advance(900);
    assert.equal(cache.get('a'), 2);
  });

  test('when full, the oldest 10% (at least 1) are evicted before inserting', () => {
    const cache = new ResultCache({ maxEntries: 20 });
    for (let i = 0; i < 20; i++) cache.set(`k${i}`, i);
    cache.set('new', 'x');
    assert.equal(cache.size, 19); // 20 - 2 evicted + 1 new
    assert.equal(cache.get('k0'), null);
    assert.equal(cache.get('k1'), null);
    assert.equal(cache.get('k2'), 2);
    assert.equal(cache.get('new'), 'x');
  });

  test('small cache evicts one entry', () => {
    const cache = new ResultCache({ maxEntries: 3 });
    ['a', 'b', 'c', 'd'].forEach((k) => cache.set(k, k));
    assert.deepEqual(['a', 'b', 'c', 'd'].map((k) => cache.get(k)), [null, 'b', 'c', 'd']);
  });

  test('a cached null reads as absent through has()', () => {
    // has() is implemented as get() !== null, so a stored null is a miss.
    const cache = new ResultCache();
    cache.set('a', null);
    assert.equal(cache.has('a'), false);
  });
});
