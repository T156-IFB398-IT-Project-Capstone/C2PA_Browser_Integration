// shared/settings.js — the ON/OFF setting, driven through an in-memory store.
// No chrome stub is installed: this is the check that the setting core has no
// chrome.* dependency (CLAUDE.md constraint #1).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettings, normaliseSettings, DEFAULT_SETTINGS,
} from '../../extension/src/shared/settings.js';

function memoryStore(initial) {
  let saved = initial;
  return {
    load: async () => saved,
    save: async (s) => { saved = s; },
    get saved() { return saved; },
  };
}

describe('settings', () => {
  test('checking is on by default', async () => {
    assert.equal(DEFAULT_SETTINGS.enabled, true);
    assert.equal(await createSettings(memoryStore(undefined)).isEnabled(), true);
  });

  test('setEnabled(false) is saved and read back', async () => {
    const store = memoryStore(undefined);
    const settings = createSettings(store);
    await settings.setEnabled(false);
    assert.deepEqual(store.saved, { enabled: false });
    assert.equal(await settings.isEnabled(), false);
    await settings.setEnabled(true);
    assert.equal(await settings.isEnabled(), true);
  });

  test('a new settings object sees the saved value (persists across popup opens)', async () => {
    const store = memoryStore(undefined);
    await createSettings(store).setEnabled(false);
    assert.equal(await createSettings(store).isEnabled(), false);
  });

  test('malformed saved values fall back to the default', () => {
    for (const raw of [undefined, null, {}, { enabled: 'no' }, { enabled: 0 }, 'off']) {
      assert.deepEqual(normaliseSettings(raw), { enabled: true }, JSON.stringify(raw));
    }
  });

  test('setEnabled coerces to a boolean', async () => {
    const store = memoryStore(undefined);
    await createSettings(store).setEnabled(0);
    assert.equal(store.saved.enabled, false);
  });

  test('settings.js has no chrome.* reference', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../extension/src/shared/settings.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\/.*$/gm, '');
    assert.equal(/\bchrome\./.test(code), false);
  });
});
