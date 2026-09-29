// background/tab-media-registry.js — per-tab live media list.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TabMediaRegistry } from '../../extension/src/background/tab-media-registry.js';
import { useClock } from './helpers/clock.mjs';

const PAGE = 'https://example.test/page';

describe('TabMediaRegistry', () => {
  test('first update records items with defaults', (t) => {
    useClock(t);
    const reg = new TabMediaRegistry();
    const { newItems, total } = reg.update(1, PAGE, [{ src: 'a.jpg' }]);
    assert.equal(total, 1);
    assert.deepEqual(newItems[0], {
      url: 'a.jpg', kind: 'image', alt: '', width: 0, height: 0, verifiable: false,
      firstSeen: 1_000_000, lastSeen: 1_000_000,
    });
    assert.equal(reg.getPageUrl(1), PAGE);
  });

  test('repeat items are not new, but lastSeen is refreshed', (t) => {
    const clock = useClock(t);
    const reg = new TabMediaRegistry();
    reg.update(1, PAGE, [{ src: 'a.jpg' }]);
    clock.advance(500);
    const { newItems, total } = reg.update(1, PAGE, [{ src: 'a.jpg' }, { src: 'b.mp4', kind: 'video' }]);
    assert.deepEqual(newItems.map((i) => i.url), ['b.mp4']);
    assert.equal(total, 2);
    const a = reg.getAll(1).find((i) => i.url === 'a.jpg');
    assert.equal(a.firstSeen, 1_000_000);
    assert.equal(a.lastSeen, 1_000_500);
  });

  test('items without src are skipped', () => {
    const reg = new TabMediaRegistry();
    assert.equal(reg.update(1, PAGE, [{ kind: 'image' }, { src: '' }]).total, 0);
  });

  test('a new page URL (navigation) clears the tab', () => {
    const reg = new TabMediaRegistry();
    reg.update(1, PAGE, [{ src: 'a.jpg' }]);
    const { total } = reg.update(1, 'https://example.test/other', [{ src: 'b.jpg' }]);
    assert.equal(total, 1);
    assert.deepEqual(reg.getAll(1).map((i) => i.url), ['b.jpg']);
  });

  test('an empty page URL does not count as navigation', () => {
    const reg = new TabMediaRegistry();
    reg.update(1, PAGE, [{ src: 'a.jpg' }]);
    assert.equal(reg.update(1, '', [{ src: 'b.jpg' }]).total, 2);
    assert.equal(reg.getPageUrl(1), PAGE);
  });

  test('getAll is newest-first', (t) => {
    const clock = useClock(t);
    const reg = new TabMediaRegistry();
    reg.update(1, PAGE, [{ src: 'old.jpg' }]);
    clock.advance(10);
    reg.update(1, PAGE, [{ src: 'new.jpg' }]);
    assert.deepEqual(reg.getAll(1).map((i) => i.url), ['new.jpg', 'old.jpg']);
  });

  test('tabs are independent; clear() removes one tab', () => {
    const reg = new TabMediaRegistry();
    reg.update(1, PAGE, [{ src: 'a.jpg' }]);
    reg.update(2, PAGE, [{ src: 'b.jpg' }, { src: 'c.jpg' }]);
    assert.equal(reg.size, 2);
    assert.equal(reg.getCount(2), 2);
    reg.clear(1);
    assert.equal(reg.size, 1);
    assert.deepEqual(reg.getAll(1), []);
    assert.equal(reg.getCount(1), 0);
    assert.equal(reg.getPageUrl(1), '');
  });
});
