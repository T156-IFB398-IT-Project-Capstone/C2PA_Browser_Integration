// src/shared/settings.js
//
// The ON/OFF setting for Content Credentials checking.
//
// No chrome.* in this file (CLAUDE.md constraint #1). Storage goes through a
// store adapter with two methods:
//
//   store.load()          → Promise<object | undefined>   the saved settings
//   store.save(settings)  → Promise<void>
//
// The extension passes createChromeSettingsStore() (chrome-settings-store.js).
// Conversion note: in the built-in browser feature this setting becomes a
// browser preference shown on the settings page. Databench swaps the store
// adapter for one backed by that preference; nothing in this file changes.

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true });

/**
 * Fill in defaults and drop malformed values. Exported so callers that
 * receive raw stored values (change events) normalise them the same way.
 * @param {unknown} raw
 * @returns {{ enabled: boolean }}
 */
export function normaliseSettings(raw) {
  const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_SETTINGS.enabled;
  return { enabled };
}

/**
 * @param {{ load(): Promise<object|undefined>, save(s: object): Promise<void> }} store
 */
export function createSettings(store) {
  async function read() {
    return normaliseSettings(await store.load());
  }

  return {
    read,
    async isEnabled() {
      return (await read()).enabled;
    },
    async setEnabled(on) {
      await store.save({ ...(await read()), enabled: !!on });
    },
  };
}
