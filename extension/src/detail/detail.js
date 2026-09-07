// src/detail/detail.js
//
// Full-page result detail, opened as a real browser tab from the popup's
// Scan Results list (see popup.js openInspectDetail()) — a Chrome extension
// popup closes the instant a link/tab opens, so this can't live inside
// popup.html as a modal. Reads the one item to display from
// chrome.storage.local (STORAGE_KEYS.INSPECT_TARGET), written by popup.js
// immediately before opening this tab.
//
// Renders with the exact same renderThumb()/statusToLabel() the popup's
// card list uses, so the Shield badge and status wording can never drift
// between the card you clicked and this detail view.

import { STORAGE_KEYS } from '../shared/constants.js';
import { statusToLabel } from '../shared/status-label.js';
import { renderThumb } from '../shared/render-thumb.js';

const $ = id => document.getElementById(id);

const urlEl    = $('url');
const emptyEl  = $('empty');
const bodyEl   = $('body');
const mediaEl  = $('media');
const detailsEl = $('details');
const jsonEl   = $('json');

function addDetailRow(label, value, full = false) {
  const wrap = document.createElement('div');
  if (full) wrap.className = 'details-full';
  const labelEl = document.createElement('div');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'detail-value';
  valueEl.textContent = value;
  wrap.appendChild(labelEl);
  wrap.appendChild(valueEl);
  detailsEl.appendChild(wrap);
}

function addStatusRow(status) {
  const wrap = document.createElement('div');
  const labelEl = document.createElement('div');
  labelEl.className = 'detail-label';
  labelEl.textContent = 'Status';
  const pill = document.createElement('span');
  pill.className = `status-pill status-${status}`;
  pill.textContent = `${statusToLabel(status)} (${status ?? 'unknown'})`;
  wrap.appendChild(labelEl);
  wrap.appendChild(pill);
  detailsEl.appendChild(wrap);
}

async function init() {
  let item = null;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.INSPECT_TARGET);
    item = stored[STORAGE_KEYS.INSPECT_TARGET] ?? null;
  } catch { /* fall through to empty state */ }

  if (!item) {
    emptyEl.classList.remove('hidden');
    return;
  }

  const key = item.sourceUrl || item.src || '';
  urlEl.textContent = key;
  document.title = `C2PA Result Detail — ${key}`;

  mediaEl.appendChild(renderThumb(item, { interactive: true }));

  addStatusRow(item.status);
  addDetailRow('Author / creator', item.manifest?.creator || 'N/A');
  addDetailRow('Signer / common name', item.manifest?.signer?.common_name || 'Unsigned / no manifest');
  addDetailRow('Signer issuer', item.manifest?.signer?.issuer || 'N/A');
  addDetailRow('AI disclosure', item.manifest?.ai_disclosure ? `Yes (${item.manifest.ai_source_type ?? 'unspecified'})` : 'No');
  addDetailRow('TSA timestamp', item.manifest?.tsa_info?.time || 'N/A');
  addDetailRow('TSA validated', item.manifest?.tsa_info?.validated ? 'Yes' : 'No');
  if (item.manifest?.validity_window) {
    addDetailRow(
      'Validity window',
      `${item.manifest.validity_window.inside_validity ? 'inside validity' : 'outside validity'}, ${item.manifest.validity_window.expired ? 'certificate expired' : 'certificate not expired'}`,
      true
    );
  }
  if (item.error?.message) addDetailRow('Error', item.error.message, true);

  jsonEl.textContent = item.manifest
    ? JSON.stringify(item.manifest, null, 2)
    : '// No C2PA manifest present';

  bodyEl.classList.remove('hidden');
}

init();
