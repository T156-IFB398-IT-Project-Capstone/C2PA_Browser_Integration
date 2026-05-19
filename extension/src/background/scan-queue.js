// src/background/scan-queue.js
//
// Sprint 4 preparation: URL-keyed job tracker for the verification pipeline.
//
// The service worker creates one ScanQueue instance per browser session.
// It uses this to deduplicate in-flight requests and expose queue state
// to the popup via the GET_QUEUE_STATUS message.

export const QueueStatus = Object.freeze({
  PENDING:   'pending',
  IN_FLIGHT: 'in_flight',
  DONE:      'done',
  FAILED:    'failed',
});

export class ScanQueue {
  /**
   * @param {{ maxAge?: number }} options
   *   maxAge — milliseconds before an entry is considered stale (default 60 s)
   */
  constructor({ maxAge = 60_000 } = {}) {
    /** @type {Map<string, { status: string, result: any, error: string|null, ts: number }>} */
    this._entries = new Map();
    this._maxAge  = maxAge;
  }

  // --- Validity helpers -------------------------------------------------------

  _fresh(entry) {
    return entry && (Date.now() - entry.ts) < this._maxAge;
  }

  has(url) {
    const e = this._entries.get(url);
    if (!e || !this._fresh(e)) { this._entries.delete(url); return false; }
    return true;
  }

  isInFlight(url) {
    return this.has(url) && this._entries.get(url).status === QueueStatus.IN_FLIGHT;
  }

  isDone(url) {
    return this.has(url) && this._entries.get(url).status === QueueStatus.DONE;
  }

  getResult(url) {
    return this._fresh(this._entries.get(url)) ? (this._entries.get(url)?.result ?? null) : null;
  }

  // --- State transitions ------------------------------------------------------

  markPending(url) {
    this._entries.set(url, { status: QueueStatus.PENDING,   result: null, error: null, ts: Date.now() });
  }

  markInFlight(url) {
    const prev = this._entries.get(url) ?? {};
    this._entries.set(url, { ...prev, status: QueueStatus.IN_FLIGHT, ts: Date.now() });
  }

  markDone(url, result) {
    this._entries.set(url, { status: QueueStatus.DONE,   result, error: null,                   ts: Date.now() });
  }

  markFailed(url, error) {
    this._entries.set(url, { status: QueueStatus.FAILED, result: null, error: String(error?.message ?? error), ts: Date.now() });
  }

  // --- Maintenance ------------------------------------------------------------

  evictExpired() {
    const cutoff = Date.now() - this._maxAge;
    for (const [url, entry] of this._entries) {
      if (entry.ts < cutoff) this._entries.delete(url);
    }
  }

  get size() { return this._entries.size; }

  /** Serialisable snapshot for the GET_QUEUE_STATUS response. */
  snapshot() {
    this.evictExpired();
    return Object.fromEntries(this._entries);
  }
}
