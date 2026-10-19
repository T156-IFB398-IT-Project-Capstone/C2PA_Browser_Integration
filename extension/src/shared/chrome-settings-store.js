// src/shared/chrome-settings-store.js
//
// Extension adapter for settings.js: keeps the settings object in
// chrome.storage.local under STORAGE_KEYS.SETTINGS. This is the only file the
// browser-feature conversion replaces (see the note in settings.js).
//
// content-script.js cannot import this (classic script), so it reads the same
// key directly. Keep the key in sync — tests/unit/messages-constants.test.mjs
// checks it.

import { STORAGE_KEYS } from './constants.js';

export function createChromeSettingsStore(area = chrome.storage.local) {
  const key = STORAGE_KEYS.SETTINGS;
  return {
    async load() {
      const stored = await area.get(key);
      return stored[key];
    },
    async save(settings) {
      await area.set({ [key]: settings });
    },
  };
}
