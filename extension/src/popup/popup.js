// src/popup/popup.js
//
// Popup UI — scan trigger, result rendering, live media panel.
// Verification runs via WASM offscreen document — no service health check needed.

import { MSG, msg }              from '../shared/messages.js';
import { STORAGE_KEYS, TEST_BENCH_URLS } from '../shared/constants.js';
import { statusToLabel }         from '../shared/status-label.js';
import { renderThumb }           from '../shared/render-thumb.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);

// Tab bar
const tabScan        = $('tab-scan');
const tabLive        = $('tab-live');
const panelScan      = $('panel-scan');
const panelLive      = $('panel-live');
const liveCountBadge = $('live-count-badge');

// Scan panel
const btnScan      = $('btn-scan');
const resultsList  = $('results');
const scanMeta     = $('scan-meta');
const emptyState   = $('empty');
const progressWrap = $('scan-progress');

// Live panel
const liveList  = $('live-list');
const liveMeta  = $('live-meta');
const liveEmpty = $('live-empty');

// Test bench link + its right-click menu
const btnTestBench   = $('btn-test-bench');
const testBenchMenu  = $('test-bench-menu');


// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** ID of the tab the popup is associated with; set during init(). */
let _currentTabId = null;
/** Which tab panel is currently visible: 'scan' | 'live' */
let _activePanel  = 'scan';
/** Maximum number of live items rendered in one pass. */
const LIVE_MAX_DISPLAY = 50;
/** sourceUrl/src -> item, populated on each render so the inspect modal can look up full detail. */
const _lastResultsByUrl = new Map();

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

tabScan.addEventListener('click', () => switchPanel('scan'));
tabLive.addEventListener('click', () => {
  switchPanel('live');
  loadLiveMedia();
});

function switchPanel(name) {
  _activePanel = name;

  tabScan.classList.toggle('tab-btn--active', name === 'scan');
  tabScan.setAttribute('aria-selected', name === 'scan');

  tabLive.classList.toggle('tab-btn--active', name === 'live');
  tabLive.setAttribute('aria-selected', name === 'live');

  panelScan.classList.toggle('hidden', name !== 'scan');
  panelLive.classList.toggle('hidden', name !== 'live');
}

// ---------------------------------------------------------------------------
// Scan flow
// ---------------------------------------------------------------------------

btnScan.addEventListener('click', async () => {
  btnScan.disabled      = true;
  btnScan.textContent   = 'Scanning…';
  resultsList.innerHTML = '';
  emptyState.classList.add('hidden');
  scanMeta.classList.add('hidden');
  setProgress(0, 0);
  progressWrap?.classList.remove('hidden');

  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.SCAN_ACTIVE_TAB));
    if (!response?.ok) throw new Error(response?.error ?? 'Scan failed.');
    renderSummary(response.summary);
  } catch (err) {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
  } finally {
    progressWrap?.classList.add('hidden');
    btnScan.disabled    = false;
    btnScan.textContent = 'Scan this page';
  }
});

// ---------------------------------------------------------------------------
// Background push listeners
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === MSG.SCAN_PROGRESS) {
    const { done = 0, total = 0 } = message.payload ?? {};
    setProgress(done, total);
  }

  if (message?.type === MSG.MEDIA_UPDATED) {
    const { tabId, media = [], pageUrl = '' } = message.payload ?? {};
    if (tabId !== _currentTabId) return false;
    updateLiveBadge(media.length);
    if (_activePanel === 'live') renderLiveMedia(media, pageUrl);
  }

  return false;
});

function setProgress(done, total) {
  if (!progressWrap) return;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill  = progressWrap.querySelector('.progress-fill');
  const label = progressWrap.querySelector('.progress-label');
  if (fill)  fill.style.width  = `${pct}%`;
  if (label) label.textContent = total > 0 ? `${done} / ${total}` : '';
}

// ---------------------------------------------------------------------------
// Live media panel
// ---------------------------------------------------------------------------

async function loadLiveMedia() {
  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.GET_TAB_MEDIA));
    if (response?.ok) {
      _currentTabId = response.tabId ?? _currentTabId;
      updateLiveBadge(response.count ?? response.media?.length ?? 0);
      renderLiveMedia(response.media ?? [], response.pageUrl ?? '');
    }
  } catch {
    // SW not reachable — leave whatever was rendered before
  }
}

function updateLiveBadge(count) {
  if (!liveCountBadge) return;
  liveCountBadge.textContent = count;
  liveCountBadge.classList.toggle('hidden', count === 0);
}

/**
 * Render the live media list.
 * @param {Array<{url, kind, alt, verifiable, firstSeen}>} mediaList
 * @param {string} pageUrl
 */
function renderLiveMedia(mediaList, pageUrl) {
  liveList.innerHTML = '';

  if (!mediaList || mediaList.length === 0) {
    liveMeta.classList.add('hidden');
    liveEmpty.classList.remove('hidden');
    return;
  }

  liveEmpty.classList.add('hidden');
  liveMeta.classList.remove('hidden');
  let host = pageUrl;
  try { host = new URL(pageUrl).host; } catch {}
  liveMeta.textContent = `${mediaList.length} item${mediaList.length === 1 ? '' : 's'} detected on ${host || 'this page'}`;

  const visible = mediaList.slice(0, LIVE_MAX_DISPLAY);
  for (const item of visible) {
    liveList.appendChild(renderLiveItem(item));
  }

  if (mediaList.length > LIVE_MAX_DISPLAY) {
    const more = document.createElement('li');
    more.className   = 'live-more';
    more.textContent = `… and ${mediaList.length - LIVE_MAX_DISPLAY} more`;
    liveList.appendChild(more);
  }
}

function kindIcon(kind) {
  switch (kind) {
    case 'video':
    case 'video-poster': return '▶';
    case 'audio':        return '♪';
    default:             return '?';
  }
}

// renderThumb (media + Shield badge together) now lives in
// ../shared/render-thumb.js, imported above — shared with the new detail
// page (extension/src/detail/) so a result renders identically wherever
// it's shown.

function renderLiveItem(item) {
  const li = document.createElement('li');
  li.className = 'result-item';

  // Jump to the actual element on the page — background relays this
  // straight to the content script, which owns the DOM lookup + scroll.
  li.classList.add('result-item--clickable');
  li.title = 'Click to scroll to this on the page';
  li.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage(msg(MSG.SCROLL_TO_MEDIA, { url: item.url, kind: item.kind }));
      console.debug('[C2PA popup] scroll-to-media response:', response);
      if (!response?.ok) console.warn('[C2PA popup] scroll-to-media failed:', response?.error);
    } catch (err) {
      console.error('[C2PA popup] scroll-to-media message failed to send:', err);
    }
  });

  const isImage = (item.kind === 'image' || item.kind === 'gif' || item.kind === 'video-poster');

  if (isImage && item.url && !item.url.startsWith('blob:')) {
    const img = document.createElement('img');
    img.className = 'result-thumb';
    img.src       = item.url;
    img.alt       = item.alt || '';
    img.onerror   = () => { img.style.visibility = 'hidden'; };
    li.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className   = 'media-icon';
    icon.textContent = kindIcon(item.kind);
    icon.setAttribute('aria-label', item.kind);
    li.appendChild(icon);
  }

  const body = document.createElement('div');
  body.className = 'result-body';

  const urlEl = document.createElement('div');
  urlEl.className   = 'result-url';
  urlEl.textContent = item.url || '';
  urlEl.title       = item.url || '';
  body.appendChild(urlEl);

  const tags = document.createElement('div');
  tags.className = 'result-tags';

  const kindEl = document.createElement('span');
  kindEl.className   = `kind-badge kind-${item.kind ?? 'unknown'}`;
  kindEl.textContent = item.kind ?? 'unknown';
  tags.appendChild(kindEl);

  if (item.verifiable) {
    const vEl = document.createElement('span');
    vEl.className   = 'verifiable-badge';
    vEl.textContent = 'verifiable';
    vEl.title       = 'This item can be scanned for Content Credentials';
    tags.appendChild(vEl);
  }

  if (item.url?.startsWith('blob:')) {
    const bEl = document.createElement('span');
    bEl.className   = 'blob-badge';
    bEl.textContent = 'blob';
    bEl.title       = 'Object URL — cannot be verified remotely';
    tags.appendChild(bEl);
  }

  body.appendChild(tags);
  li.appendChild(body);
  return li;
}

// ---------------------------------------------------------------------------
// Scan result rendering
// ---------------------------------------------------------------------------

function renderSummary(summary) {
  resultsList.innerHTML = '';
  if (!summary || summary.count === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  scanMeta.classList.remove('hidden');
  let host = summary.pageUrl;
  try { host = new URL(summary.pageUrl).host; } catch {}
  const time = new Date(summary.scannedAt).toLocaleTimeString();
  scanMeta.textContent = `${summary.count} item${summary.count === 1 ? '' : 's'} on ${host} — scanned at ${time}`;

  _lastResultsByUrl.clear();
  for (const item of summary.results) {
    _lastResultsByUrl.set(item.sourceUrl || item.src, item);
    resultsList.appendChild(renderItem(item));
  }
}

function renderItem(item) {
  const key = item.sourceUrl || item.src || '';

  const li = document.createElement('li');
  li.className = 'result-item result-item--clickable';
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `Inspect detail for ${key}`);
  li.addEventListener('click', () => openInspectDetail(key));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInspectDetail(key); }
  });

  const hoverHint = document.createElement('div');
  hoverHint.className = 'result-hover-hint';
  hoverHint.textContent = 'Inspect detail →';
  li.appendChild(hoverHint);

  li.appendChild(renderThumb(item));

  const body = document.createElement('div');
  body.className = 'result-body';

  const urlEl = document.createElement('div');
  urlEl.className   = 'result-url';
  urlEl.textContent = item.sourceUrl || item.src || '';
  urlEl.title       = item.sourceUrl || item.src || '';
  body.appendChild(urlEl);

  const tags = document.createElement('div');
  tags.className = 'result-tags';

  if (item.kind) {
    const kindEl = document.createElement('span');
    kindEl.className   = `kind-badge kind-${item.kind}`;
    kindEl.textContent = item.kind;
    tags.appendChild(kindEl);
  }

  if (item._cached) {
    const cacheEl = document.createElement('span');
    cacheEl.className   = 'cache-badge';
    cacheEl.textContent = 'cached';
    cacheEl.title       = 'Result served from in-memory cache';
    tags.appendChild(cacheEl);
  }

  const statusEl = document.createElement('span');
  statusEl.className   = `result-status status-${item.status}`;
  statusEl.textContent = statusToLabel(item.status);
  tags.appendChild(statusEl);

  body.appendChild(tags);

  if (item.manifest) {
  const parts = [];

  if (item.manifest.creator) {
    parts.push(`by ${item.manifest.creator}`);
  }

  if (item.manifest.ai_disclosure) {
    parts.push('AI: yes');
  }

  if (item.manifest.signer?.common_name) {
    parts.push(`signer: ${item.manifest.signer.common_name}`);
  }

  const validity = item.manifest.validity;

  if (validity?.certificate_status === 'expired') {
    parts.push('certificate: expired');
  } else if (validity?.certificate_status === 'untrusted') {
    parts.push('certificate: untrusted');
  }

  if (validity?.timestamp_status === 'untrusted') {
    parts.push('timestamp: untrusted');
  }

  if (parts.length > 0) {
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = parts.join(' · ');
    body.appendChild(meta);
  }
}

li.appendChild(body);
return li;
}

// statusToLabel now lives in ../shared/status-label.js, imported above.

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

// ---------------------------------------------------------------------------
// Inspect detail — opens as a real browser tab, not inside the popup.
// ---------------------------------------------------------------------------
// The popup closes the instant a link/tab opens (same reason the test-bench
// button can't show an in-popup toast) — so this can't be a modal inside
// popup.html. Instead: stash the item in chrome.storage.local under a
// well-known key, then open extension/src/detail/detail.html, which reads
// it back on load. detail.js renders it with the same renderThumb() /
// statusToLabel() this file uses, so the badge and status text can't drift.

async function openInspectDetail(key) {
  const item = _lastResultsByUrl.get(key);
  if (!item) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.INSPECT_TARGET]: item });
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/detail/detail.html') });
  } catch { /* non-fatal — user just won't see a detail tab open */ }
}

// ---------------------------------------------------------------------------
// Test bench link — right-click menu + persisted left-click default
// ---------------------------------------------------------------------------
// Left-click on #btn-test-bench opens whichever of local/public is currently
// the default (persisted in chrome.storage.local, defaults to 'local').
// Right-click shows a menu explaining the difference between the two, and
// lets the user change which one left-click opens (the ☆/★ button per row —
// separate from clicking the row itself, which just opens that one now).

async function loadTestBenchDefault() {
  if (!btnTestBench) return 'local';
  let key = 'local';
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.TEST_BENCH_LINK);
    key = stored[STORAGE_KEYS.TEST_BENCH_LINK] ?? 'local';
  } catch { /* non-fatal — fall back to local */ }
  applyTestBenchDefault(key);
  return key;
}

function applyTestBenchDefault(key) {
  btnTestBench.href = TEST_BENCH_URLS[key] ?? TEST_BENCH_URLS.local;
  testBenchMenu?.querySelectorAll('.context-menu-default').forEach(btn => {
    const isDefault = btn.dataset.key === key;
    btn.textContent = isDefault ? '★' : '☆';
    btn.classList.toggle('is-default', isDefault);
  });
}

function setupTestBenchMenu() {
  if (!btnTestBench || !testBenchMenu) return;

  btnTestBench.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    testBenchMenu.classList.remove('hidden');
  });

  testBenchMenu.addEventListener('click', async (e) => {
    const defaultBtn = e.target.closest('.context-menu-default');
    if (defaultBtn) {
      const key = defaultBtn.dataset.key;
      applyTestBenchDefault(key);
      try { await chrome.storage.local.set({ [STORAGE_KEYS.TEST_BENCH_LINK]: key }); } catch { /* non-fatal */ }
      return; // don't navigate, don't close the menu — just updates the star
    }

    const openBtn = e.target.closest('.context-menu-open');
    if (openBtn) {
      window.open(openBtn.dataset.url, '_blank', 'noopener');
      testBenchMenu.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!testBenchMenu.classList.contains('hidden') && e.target !== btnTestBench && !testBenchMenu.contains(e.target)) {
      testBenchMenu.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') testBenchMenu.classList.add('hidden');
  });
}

setupTestBenchMenu();
loadTestBenchDefault();

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

(async function init() {
  // 1. Identify the tab this popup belongs to (needed to filter MEDIA_UPDATED).
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    _currentTabId = tab?.id ?? null;
  } catch { /* non-fatal */ }

  // 2. Restore last scan result on the scan panel.
  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.GET_LAST_RESULT));
    if (response?.ok && response.summary) {
      renderSummary(response.summary);
    } else {
      emptyState.classList.remove('hidden');
    }
  } catch {
    emptyState.classList.remove('hidden');
  }

  // 3. Pre-populate the live badge count (panel stays hidden until user clicks).
  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.GET_TAB_MEDIA));
    if (response?.ok) {
      _currentTabId = response.tabId ?? _currentTabId;
      updateLiveBadge(response.count ?? response.media?.length ?? 0);
    }
  } catch { /* non-fatal */ }

  // 4. WASM verifier is always ready — enable scan.
  btnScan.disabled = false;
})();
