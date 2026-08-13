// src/popup/popup.js
//
// Popup UI — scan trigger, result rendering, live media panel.
// Verification runs via WASM offscreen document — no service health check needed.

import { MSG, msg }      from '../shared/messages.js';
import { VERIFY_STATUS } from '../shared/constants.js';

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** ID of the tab the popup is associated with; set during init(). */
let _currentTabId = null;
/** Which tab panel is currently visible: 'scan' | 'live' */
let _activePanel  = 'scan';
/** Maximum number of live items rendered in one pass. */
const LIVE_MAX_DISPLAY = 50;

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

function renderLiveItem(item) {
  const li = document.createElement('li');
  li.className = 'result-item';

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

  for (const item of summary.results) {
    resultsList.appendChild(renderItem(item));
  }
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'result-item';

  const img = document.createElement('img');
  img.className = 'result-thumb';
  img.src       = item.src || item.sourceUrl || '';
  img.alt       = item.alt || '';
  img.onerror   = () => { img.style.visibility = 'hidden'; };
  li.appendChild(img);

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
    const meta  = document.createElement('div');
    meta.className = 'result-meta';
    const parts = [];
    if (item.manifest.creator)             parts.push(`by ${item.manifest.creator}`);
    if (item.manifest.ai_disclosure)       parts.push('AI: yes');
    if (item.manifest.signer?.common_name) parts.push(`signer: ${item.manifest.signer.common_name}`);
    if (item.manifest.tsa_info?.validated) parts.push('TSA timestamped');
    meta.textContent = parts.join(' · ');
    body.appendChild(meta);
  } else if (item.error?.message) {
    const meta  = document.createElement('div');
    meta.className   = 'result-meta';
    meta.textContent = item.error.message;
    meta.style.color = 'var(--danger)';
    body.appendChild(meta);
  }

  li.appendChild(body);
  return li;
}

function statusToLabel(status) {
  switch (status) {
    case VERIFY_STATUS.VERIFIED_TRUSTED:    return 'Verified — trusted';
    case VERIFY_STATUS.VERIFIED_TSA:        return 'Verified via TSA';
    case VERIFY_STATUS.VERIFIED_UNTRUSTED:  return 'Signed — provider not in trust list';
    case VERIFY_STATUS.SIGNING_EXPIRED:     return 'Expired (No TSA)';
    case VERIFY_STATUS.CONTENT_TAMPERED:   return 'Content tampered';
    case VERIFY_STATUS.BROKEN_SIGNATURE:    return 'Broken signature';
    case VERIFY_STATUS.INVALID_OR_CHANGED:  return 'Invalid or changed';
    case VERIFY_STATUS.NO_CREDENTIALS:      return 'No Content Credentials';
    case VERIFY_STATUS.UNSUPPORTED_FORMAT:  return 'Format not supported';
    case 'error':                           return 'Error';
    default:                                return status ?? 'Unknown';
  }
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

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
