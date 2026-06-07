// src/background/tab-media-registry.js
//
// Per-tab media store for the realtime tracking feature.
//
// One instance lives in service-worker module scope for the browser session.
// Entries are keyed by source URL; the registry for a tab is cleared when the
// tab navigates away (detected via chrome.tabs.onUpdated) or is closed
// (chrome.tabs.onRemoved). This keeps memory bounded to active pages.

export class TabMediaRegistry {
  constructor() {
    // Map<tabId, { pageUrl: string, media: Map<url, MediaRecord>, updatedAt: number }>
    this._tabs = new Map();
  }

  /**
   * Merge newly-detected media into the registry for a tab.
   *
   * If the page URL changed the old entry set is cleared first (navigation).
   * Items already in the registry have their lastSeen timestamp refreshed.
   *
   * @param {number}   tabId
   * @param {string}   pageUrl
   * @param {Array<{ src: string, kind: string, alt?: string, width?: number, height?: number, verifiable?: boolean }>} items
   * @returns {{ newItems: MediaRecord[], total: number }}
   */
  update(tabId, pageUrl, items) {
    let state = this._tabs.get(tabId);

    // Detect navigation: clear old state when the page URL changes.
    const urlChanged = state && pageUrl && state.pageUrl && state.pageUrl !== pageUrl;
    if (!state || urlChanged) {
      state = { pageUrl: pageUrl ?? '', media: new Map(), updatedAt: Date.now() };
      this._tabs.set(tabId, state);
    }
    if (pageUrl && !state.pageUrl) state.pageUrl = pageUrl;

    const now      = Date.now();
    const newItems = [];

    for (const item of items) {
      const key = item.src;
      if (!key) continue;

      if (!state.media.has(key)) {
        const record = {
          url:        key,
          kind:       item.kind       ?? 'image',
          alt:        item.alt        ?? '',
          width:      item.width      ?? 0,
          height:     item.height     ?? 0,
          verifiable: item.verifiable ?? false,
          firstSeen:  now,
          lastSeen:   now,
        };
        state.media.set(key, record);
        newItems.push(record);
      } else {
        state.media.get(key).lastSeen = now;
      }
    }

    state.updatedAt = now;
    return { newItems, total: state.media.size };
  }

  /**
   * Return all tracked records for a tab, sorted newest-first.
   * @param {number} tabId
   * @returns {MediaRecord[]}
   */
  getAll(tabId) {
    const state = this._tabs.get(tabId);
    if (!state) return [];
    return [...state.media.values()].sort((a, b) => b.firstSeen - a.firstSeen);
  }

  /** @param {number} tabId */
  getPageUrl(tabId) {
    return this._tabs.get(tabId)?.pageUrl ?? '';
  }

  /** Total media count for a tab (0 if unknown). */
  getCount(tabId) {
    return this._tabs.get(tabId)?.media.size ?? 0;
  }

  /** Remove all data for a closed or navigated tab. */
  clear(tabId) {
    this._tabs.delete(tabId);
  }

  /** Number of tabs currently tracked. */
  get size() {
    return this._tabs.size;
  }
}
