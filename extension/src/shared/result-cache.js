// src/shared/result-cache.js
//
// Sprint 4 preparation: lightweight in-memory verification result cache.
//
// Keyed by source URL. Entries expire after CACHE_TTL_MS and the oldest
// entries are evicted when CACHE_MAX_ENTRIES is reached.
//
// The cache lives in service-worker module scope (one instance per SW
// lifetime). On SW restart the cache starts empty — this is intentional;
// Sprint 4 can opt into chrome.storage.session persistence if needed.

import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from './constants.js';

export class ResultCache {
  /**
   * @param {{ ttl?: number, maxEntries?: number }} options
   */
  constructor({ ttl = CACHE_TTL_MS, maxEntries = CACHE_MAX_ENTRIES } = {}) {
    /** @type {Map<string, { value: any, ts: number }>} */
    this._cache   = new Map();
    this._ttl     = ttl;
    this._max     = maxEntries;
  }

  // --- Public interface -------------------------------------------------------

  /**
   * Return the cached value for `url`, or null if absent / stale.
   */
  get(url) {
    const entry = this._cache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttl) {
      this._cache.delete(url);
      return null;
    }
    return entry.value;
  }

  /**
   * Store a result. Evicts oldest entries if over capacity.
   */
  set(url, value) {
    if (this._cache.size >= this._max) this._evictOldest();
    this._cache.set(url, { value, ts: Date.now() });
  }

  has(url) {
    return this.get(url) !== null;
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }

  // --- Internal ---------------------------------------------------------------

  _evictOldest() {
    // Maps preserve insertion order; remove the oldest 10% in one pass.
    const evict = Math.max(1, Math.floor(this._max * 0.1));
    let   count = 0;
    for (const key of this._cache.keys()) {
      this._cache.delete(key);
      if (++count >= evict) break;
    }
  }
}
