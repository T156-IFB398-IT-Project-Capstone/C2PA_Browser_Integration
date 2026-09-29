// background/scan-queue.js — URL-keyed job tracker.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ScanQueue, QueueStatus } from '../../extension/src/background/scan-queue.js';
import { useClock } from './helpers/clock.mjs';

describe('ScanQueue', () => {
  test('state transitions: pending -> in flight -> done', (t) => {
    useClock(t);
    const q = new ScanQueue();
    q.markPending('u');
    assert.equal(q.has('u'), true);
    assert.equal(q.isInFlight('u'), false);
    q.markInFlight('u');
    assert.equal(q.isInFlight('u'), true);
    q.markDone('u', { status: 'ok' });
    assert.equal(q.isDone('u'), true);
    assert.deepEqual(q.getResult('u'), { status: 'ok' });
  });

  test('markFailed stores the error message as a string', (t) => {
    useClock(t);
    const q = new ScanQueue();
    q.markFailed('u', new Error('fetch failed'));
    q.markFailed('v', 'plain string');
    const snap = q.snapshot();
    assert.equal(snap.u.status, QueueStatus.FAILED);
    assert.equal(snap.u.error, 'fetch failed');
    assert.equal(snap.v.error, 'plain string');
  });

  test('markInFlight keeps an earlier result', (t) => {
    useClock(t);
    const q = new ScanQueue();
    q.markDone('u', 'old');
    q.markInFlight('u');
    assert.equal(q.snapshot().u.result, 'old');
  });

  test('entries go stale at maxAge and are removed', (t) => {
    const clock = useClock(t);
    const q = new ScanQueue({ maxAge: 1_000 });
    q.markDone('u', 'r');
    clock.advance(999);
    assert.equal(q.getResult('u'), 'r');
    clock.advance(1);
    assert.equal(q.getResult('u'), null);
    assert.equal(q.has('u'), false);
    assert.equal(q.size, 0, 'has() deletes the stale entry');
  });

  test('snapshot() evicts expired entries and is a plain object', (t) => {
    const clock = useClock(t);
    const q = new ScanQueue({ maxAge: 1_000 });
    q.markDone('old', 1);
    clock.advance(600);
    q.markDone('new', 2);
    clock.advance(600);
    const snap = q.snapshot();
    assert.deepEqual(Object.keys(snap), ['new']);
    assert.equal(JSON.parse(JSON.stringify(snap)).new.status, QueueStatus.DONE);
  });

  test('unknown URL', () => {
    const q = new ScanQueue();
    assert.equal(q.has('x'), false);
    assert.equal(q.getResult('x'), null);
  });
});
