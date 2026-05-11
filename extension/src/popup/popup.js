// src/popup/popup.js

import { MSG, msg } from '../shared/messages.js';
import { STORAGE_KEYS, VERIFY_STATUS } from '../shared/constants.js';

// --- DOM refs ---------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const viewMain      = $('view-main');
const viewSettings  = $('view-settings');
const btnSettings   = $('btn-settings');
const btnBack       = $('btn-back');
const btnScan       = $('btn-scan');
const btnSave       = $('btn-save');
const btnTest       = $('btn-test');
const inputSecret   = $('input-secret');
const serviceStatus = $('service-status');
const resultsList   = $('results');
const scanMeta      = $('scan-meta');
const emptyState    = $('empty');
const feedback      = $('settings-feedback');

// --- routing between main and settings --------------------------------------

btnSettings.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SHARED_SECRET);
  inputSecret.value = stored[STORAGE_KEYS.SHARED_SECRET] ?? '';
  viewMain.classList.add('hidden');
  viewSettings.classList.remove('hidden');
  feedback.classList.add('hidden');
});

btnBack.addEventListener('click', () => {
  viewSettings.classList.add('hidden');
  viewMain.classList.remove('hidden');
});

// --- settings actions --------------------------------------------------------

btnSave.addEventListener('click', async () => {
  const secret = inputSecret.value.trim();
  if (!secret) {
    showFeedback('Paste a shared secret first.', false);
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.SHARED_SECRET]: secret });
  showFeedback('Saved. Click “Test connection” to confirm.', true);
  refreshServiceStatus();
});

btnTest.addEventListener('click', async () => {
  btnTest.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.TEST_SERVICE));
    if (response?.ok) {
      showFeedback(`Service online (v${response.health.version ?? '?'}).`, true);
      setServiceBanner('ok', 'Local service: online');
    } else {
      showFeedback(`Service unreachable: ${response?.error ?? 'unknown error'}`, false);
      setServiceBanner('down', 'Local service: unreachable');
    }
  } catch (err) {
    showFeedback(err.message, false);
    setServiceBanner('down', 'Local service: unreachable');
  } finally {
    btnTest.disabled = false;
  }
});

function showFeedback(text, ok) {
  feedback.textContent = text;
  feedback.classList.remove('hidden', 'feedback--ok', 'feedback--err');
  feedback.classList.add(ok ? 'feedback--ok' : 'feedback--err');
}

// --- scan flow --------------------------------------------------------------

btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  btnScan.textContent = 'Scanning…';
  resultsList.innerHTML = '';
  emptyState.classList.add('hidden');
  scanMeta.classList.add('hidden');

  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.SCAN_ACTIVE_TAB));
    if (!response?.ok) throw new Error(response?.error ?? 'Scan failed');
    renderSummary(response.summary);
  } catch (err) {
    resultsList.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `<p style="color: var(--danger);">${escape(err.message)}</p>`;
  } finally {
    btnScan.disabled = false;
    btnScan.textContent = 'Scan this page';
  }
});

function renderSummary(summary) {
  if (!summary || summary.count === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  scanMeta.classList.remove('hidden');
  scanMeta.textContent =
    `Scanned ${summary.count} image${summary.count === 1 ? '' : 's'} on ${new URL(summary.pageUrl).host}`;

  resultsList.innerHTML = '';
  for (const item of summary.results) {
    resultsList.appendChild(renderItem(item));
  }
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'result-item';

  const img = document.createElement('img');
  img.className = 'result-thumb';
  img.src = item.sourceUrl;
  img.alt = item.alt || '';
  img.onerror = () => { img.style.visibility = 'hidden'; };
  li.appendChild(img);

  const body = document.createElement('div');
  body.className = 'result-body';

  const url = document.createElement('div');
  url.className = 'result-url';
  url.textContent = item.sourceUrl;
  url.title = item.sourceUrl;
  body.appendChild(url);

  const statusLabel = statusToLabel(item.status);
  const status = document.createElement('span');
  status.className = `result-status status-${item.status}`;
  status.textContent = statusLabel;
  body.appendChild(status);

  if (item.manifest) {
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const parts = [];
    if (item.manifest.creator) parts.push(`by ${item.manifest.creator}`);
    if (item.manifest.ai_disclosure) parts.push('AI disclosure: yes');
    if (item.manifest.signer?.common_name) parts.push(`signer: ${item.manifest.signer.common_name}`);
    meta.textContent = parts.join(' · ');
    body.appendChild(meta);
  } else if (item.error) {
    const meta = document.createElement('div');
    meta.className = 'result-meta';
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
    case VERIFY_STATUS.VERIFIED_UNTRUSTED:  return 'Verified — signer not trusted';
    case VERIFY_STATUS.INVALID_OR_CHANGED:  return 'Invalid or changed';
    case VERIFY_STATUS.NO_CREDENTIALS:      return 'No Content Credentials';
    case VERIFY_STATUS.UNSUPPORTED_FORMAT:  return 'Format not supported (Sem 1)';
    case 'error':                           return 'Error';
    default:                                return status;
  }
}

function escape(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- service status banner --------------------------------------------------

function setServiceBanner(state, text) {
  serviceStatus.classList.remove('service-banner--unknown', 'service-banner--ok', 'service-banner--down');
  serviceStatus.classList.add(`service-banner--${state}`);
  serviceStatus.querySelector('.service-label').textContent = text;
  btnScan.disabled = state !== 'ok';
}

async function refreshServiceStatus() {
  try {
    const response = await chrome.runtime.sendMessage(msg(MSG.TEST_SERVICE));
    if (response?.ok) {
      setServiceBanner('ok', `Local service: online (v${response.health.version ?? '?'})`);
    } else {
      setServiceBanner('down', 'Local service: unreachable');
    }
  } catch {
    setServiceBanner('down', 'Local service: unreachable');
  }
}

// --- initial load -----------------------------------------------------------

(async function init() {
  // Restore last scan if one exists.
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

  refreshServiceStatus();
})();
