// C2PA Test Bench Application Logic - Aligned with Real Extension Output & Verification Engine

// Exact status definitions matching extension src/shared/constants.js
const VERIFY_STATUS = Object.freeze({
  VERIFIED_TRUSTED: 'verified_trusted',
  VERIFIED_TSA: 'verified_tsa',
  VERIFIED_UNTRUSTED: 'verified_untrusted',
  SIGNING_EXPIRED: 'signing_expired',
  CONTENT_TAMPERED: 'content_tampered',
  BROKEN_SIGNATURE: 'broken_signature',
  INVALID_OR_CHANGED: 'invalid_or_changed',
  NO_CREDENTIALS: 'no_credentials',
  UNSUPPORTED_FORMAT: 'unsupported_format',
});

// Human readable status label mapping matching extension src/popup/popup.js (statusToLabel)
function getStatusLabel(status) {
  switch (status) {
    case VERIFY_STATUS.VERIFIED_TRUSTED: return 'Verified — trusted';
    case VERIFY_STATUS.VERIFIED_TSA: return 'Verified via TSA';
    case VERIFY_STATUS.VERIFIED_UNTRUSTED: return 'Signed — provider not in trust list';
    case VERIFY_STATUS.SIGNING_EXPIRED: return 'Expired (No TSA)';
    case VERIFY_STATUS.CONTENT_TAMPERED: return 'Content tampered';
    case VERIFY_STATUS.BROKEN_SIGNATURE: return 'Broken signature';
    case VERIFY_STATUS.INVALID_OR_CHANGED: return 'Invalid or changed';
    case VERIFY_STATUS.NO_CREDENTIALS: return 'No Content Credentials';
    case VERIFY_STATUS.UNSUPPORTED_FORMAT: return 'Format not supported';
    default: return status || 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Live verification — real bytes through the real extension verifier.
// window.C2PAVerify / window.SUPPORTED_MIME_TYPES are set by verify-bundle.js
// (built from verify-entry.mjs, see build.mjs), which imports directly from
// extension/src/offscreen/offscreen.js — not a reimplementation.
// ---------------------------------------------------------------------------

// Same 5-branch extension-based MIME fallback as service-worker.js's
// fetchAsBytes(), adapted for a filename (no query string, so `$` not `(\?|$)`).
function guessMimeType(providedType, filename) {
  if (window.SUPPORTED_MIME_TYPES.includes(providedType)) return providedType;
  if (/\.jpe?g$/i.test(filename)) return 'image/jpeg';
  if (/\.png$/i.test(filename))   return 'image/png';
  if (/\.gif$/i.test(filename))   return 'image/gif';
  if (/\.webp$/i.test(filename))  return 'image/webp';
  if (/\.mp4$/i.test(filename))   return 'video/mp4';
  return providedType;
}

// Shared by the on-load asset-verification loop and the upload sandbox, so
// both stay behind one real "supported or not" check rather than drifting.
async function verifyBytes(bytes, filename, providedType = '') {
  const mimeType = guessMimeType(providedType, filename);
  if (!window.SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return { status: VERIFY_STATUS.UNSUPPORTED_FORMAT, manifest: null, error: null };
  }
  return window.C2PAVerify({ bytes, mimeType });
}

// Builds the verification-derived subset of a card object from a real
// { status, manifest, error } response — used for both the on-load assets
// and uploaded files, so the two card shapes can never drift apart.
function fieldsFromResult({ status, manifest, error }) {
  return {
    status,
    statusLabel: getStatusLabel(status),
    creator: manifest?.creator ?? 'N/A',
    signer: manifest?.signer?.common_name ?? 'Unsigned / No Manifest',
    aiDisclosure: manifest?.ai_disclosure ?? false,
    // Real extractManifest() output has no SKI field at all — never
    // fabricate one. Real SKI extraction is separate, not-yet-built work.
    ski: 'N/A',
    timestamp: manifest?.tsa_info?.time ?? manifest?.signer?.time ?? 'N/A',
    validationStatus: status,
    checksum: error ? `FAIL (${error.message})` : getStatusLabel(status),
    techId: error ? 'verify() threw' : (manifest ? 'reader.manifestStore() -> populated' : 'fromBlob() -> null'),
    rawManifest: manifest,
  };
}

// Initial test cases — media reference only. Verification-derived fields
// (status/creator/signer/etc.) are populated live on load, see
// verifyInitialCases() below — not hardcoded, per the Sprint 2/3 tracker
// row this closes ("wire video results through the result model on the
// test bench... connected to the real verification pipeline").
const initialTestCases = [
  { id: 'case-verified-tsa-camera',   title: 'Camera Capture (Truepic TSA)',      mediaType: 'image', src: 'assets/verified-trusted.jpg' },
  { id: 'case-sample-video',          title: 'Zoetrope Animation (MP4 Video)',    mediaType: 'video', src: 'assets/sample-video.mp4' },
  { id: 'case-verified-tsa-landscape', title: 'Landscape Photo (Truepic TSA)',    mediaType: 'image', src: 'assets/verified-tsa.jpg' },
  { id: 'case-invalid-earth',         title: 'Earth Image',                       mediaType: 'image', src: 'assets/untrusted-signer.jpg' },
  { id: 'case-untrusted-fish',        title: 'Underwater Fish',                   mediaType: 'image', src: 'assets/expired-cert.jpg' },
  { id: 'case-content-tampered',      title: 'Tampered Pixels',                   mediaType: 'image', src: 'assets/tampered-pixels.jpeg' },
  { id: 'case-broken-signature',      title: 'Corrupt Signature',                 mediaType: 'image', src: 'assets/broken-signature.jpg' },
  { id: 'case-invalid-changed',       title: 'URI Mismatch',                      mediaType: 'image', src: 'assets/invalid-generic.jpg' },
  { id: 'case-no-credentials',        title: 'Plain Photo',                       mediaType: 'image', src: 'assets/no-credentials.jpg' },
  { id: 'case-unsupported-format',    title: 'Plain Text File',                   mediaType: 'image', src: 'assets/unsupported-file.txt' },
];

let testCases = [];

// Fetches each reference asset (same-origin static files) and runs it
// through the real verifier, replacing the old hand-authored status/creator/
// signer/etc. fields. Titles above are deliberately outcome-neutral now
// (e.g. "Earth Image" not "Earth Image (Invalid or Changed)") since the
// real result is what determines that, not a label written in advance.
async function verifyInitialCases() {
  const verified = await Promise.all(initialTestCases.map(async (ref) => {
    try {
      const res = await fetch(ref.src);
      const buf = await res.arrayBuffer();
      const result = await verifyBytes(new Uint8Array(buf), ref.src);
      return { ...ref, ...fieldsFromResult(result), desc: `${ref.src} — verified live on load.` };
    } catch (err) {
      return { ...ref, ...fieldsFromResult({ status: 'error', manifest: null, error: { message: err.message } }), desc: `${ref.src} — fetch/verify failed.` };
    }
  }));
  testCases = verified;
  renderStats();
  renderGrid();
}

document.addEventListener('DOMContentLoaded', () => {
  // Loading state — cards populate once live verification completes
  // (WASM cold-start on the first call adds real, if brief, latency).
  const grid = document.getElementById('media-grid');
  if (grid) grid.innerHTML = '<div class="empty-state"><h3>Verifying reference assets…</h3></div>';

  setupEventListeners();
  verifyInitialCases();
});

function renderStats() {
  const totalEl = document.getElementById('stat-total');
  if (!totalEl) return; // Header stats section removed for clean UI

  const total = testCases.length;
  const verifiedTrusted = testCases.filter(t => t.status === VERIFY_STATUS.VERIFIED_TRUSTED).length;
  const verifiedTsa = testCases.filter(t => t.status === VERIFY_STATUS.VERIFIED_TSA).length;
  const verifiedUntrusted = testCases.filter(t => t.status === VERIFY_STATUS.VERIFIED_UNTRUSTED).length;
  const tampered = testCases.filter(t => t.status === VERIFY_STATUS.CONTENT_TAMPERED || t.status === VERIFY_STATUS.BROKEN_SIGNATURE || t.status === VERIFY_STATUS.INVALID_OR_CHANGED).length;
  const expired = testCases.filter(t => t.status === VERIFY_STATUS.SIGNING_EXPIRED).length;
  const unsigned = testCases.filter(t => t.status === VERIFY_STATUS.NO_CREDENTIALS).length;
  const videos = testCases.filter(t => t.mediaType === 'video').length;

  totalEl.textContent = total;
  const vEl = document.getElementById('stat-verified'); if (vEl) vEl.textContent = verifiedTrusted + verifiedTsa;
  const tEl = document.getElementById('stat-tampered'); if (tEl) tEl.textContent = tampered;
  const uEl = document.getElementById('stat-untrusted'); if (uEl) uEl.textContent = verifiedUntrusted + expired;
  const sEl = document.getElementById('stat-unsigned'); if (sEl) sEl.textContent = unsigned;
  const videoStatEl = document.getElementById('stat-videos'); if (videoStatEl) videoStatEl.textContent = videos;
}


function renderGrid() {
  const grid = document.getElementById('media-grid');
  grid.innerHTML = '';

  if (testCases.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <h3>No C2PA test items found</h3>
      </div>
    `;
    return;
  }

  testCases.forEach(item => {
    const card = document.createElement('div');
    card.className = `test-card`;

    let mediaHtml = '';
    if (item.mediaType === 'video') {
      mediaHtml = `
        <video src="${item.src}" controls preload="metadata"></video>
        <span class="media-badge">
          <svg viewBox="0 0 24 24"><path d="M15 10l5-3v10l-5-3v3H4V7h11v3z"></path></svg>
          MP4 Video
        </span>
      `;
    } else {
      mediaHtml = `
        <img src="${item.src}" alt="${item.title}" loading="lazy">
        <span class="media-badge">
          <svg viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          Image
        </span>
      `;
    }

    const metaLine = [
      item.creator && item.creator !== 'N/A' ? `by ${item.creator}` : null,
      item.aiDisclosure ? 'AI: yes' : null,
      item.signer && item.signer !== 'Unsigned / No Manifest' ? `signer: ${item.signer}` : null
    ].filter(Boolean).join(' · ');

    // Same badge-selection logic as the extension popup (shared/badge-map.js,
    // exposed via verify-entry.mjs) — no badge for tampered/broken/invalid/
    // no-credentials/unsupported results, same as the popup.
    const badgeState = window.pickBadgeState ? window.pickBadgeState(item) : null;
    const badgeHtml = badgeState
      ? `<img class="shield-badge" src="../extension/src/popup/badges/${window.BADGE_FILES[badgeState].file}" alt="${window.BADGE_FILES[badgeState].alt}" title="${window.BADGE_FILES[badgeState].alt}">`
      : '';

    card.innerHTML = `
      <div class="card-media-wrapper">
        ${mediaHtml}
        ${badgeHtml}
      </div>
      <div class="card-body">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="status-badge ${item.status}">
            <span class="dot"></span>
            ${item.statusLabel}
          </span>
        </div>
        <h3 class="card-title">${item.title}</h3>
        ${metaLine ? `<div style="font-size:0.775rem; color:var(--text-muted); font-weight:500;">${metaLine}</div>` : ''}
        <p class="card-desc">${item.desc}</p>
        <div class="card-footer">
          <span class="tech-tag">${item.techId}</span>
          <button class="inspect-btn" onclick="openInspectModal('${item.id}')">
            Inspect Manifest
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function setupEventListeners() {

  // Drag & drop upload file sandbox
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-upload-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleUploadedFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleUploadedFiles(e.target.files);
      }
    });
  }

  // Modal close listeners
  const modalOverlay = document.getElementById('inspect-modal');
  const closeBtn = document.getElementById('close-modal');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeInspectModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeInspectModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInspectModal();
  });
}

// Real verification for whatever gets dropped/browsed in — signed or not,
// image or video, valid or garbage. No outcome is assumed or fabricated;
// see verifyBytes()/fieldsFromResult() above, which this shares with the
// on-load reference-asset path so the two can't drift apart.
async function handleUploadedFiles(files) {
  for (const file of Array.from(files)) {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
    const mediaUrl = URL.createObjectURL(file); // preview only — bytes for verification are read separately below

    const id = 'custom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const baseItem = { id, title: file.name, mediaType: isVideo ? 'video' : 'image', src: mediaUrl };

    let result;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      result = await verifyBytes(bytes, file.name, file.type);
    } catch (err) {
      result = { status: 'error', manifest: null, error: { message: err.message } };
    }

    const newItem = {
      ...baseItem,
      ...fieldsFromResult(result),
      desc: `File size: ${(file.size / (1024 * 1024)).toFixed(2)} MB.`,
    };

    testCases.unshift(newItem);
    renderStats();
    renderGrid();
  }
}

function openInspectModal(id) {
  const item = testCases.find(t => t.id === id);
  if (!item) return;

  const modal = document.getElementById('inspect-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalPreview = document.getElementById('modal-media-preview');
  const modalGrid = document.getElementById('modal-details-grid');
  const jsonBox = document.getElementById('modal-json-box');

  modalTitle.textContent = `Manifest Inspection: ${item.title}`;

  if (item.mediaType === 'video') {
    modalPreview.innerHTML = `<video src="${item.src}" controls autoplay style="width:100%; max-height:260px;"></video>`;
  } else {
    modalPreview.innerHTML = `<img src="${item.src}" alt="${item.title}" style="max-width:100%; max-height:260px; object-fit:contain;">`;
  }

  modalGrid.innerHTML = `
    <div class="detail-item">
      <div class="detail-label">VERIFY_STATUS Code</div>
      <div class="detail-value" style="font-family: monospace; color: #a5b4fc;">${item.status}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Status Label</div>
      <div class="detail-value">${item.statusLabel}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Author / Creator</div>
      <div class="detail-value">${item.creator || 'N/A'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Signer / Common Name</div>
      <div class="detail-value">${item.signer}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Subject Key Identifier (SKI)</div>
      <div class="detail-value">${item.ski}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Timestamp / TSA Info</div>
      <div class="detail-value">${item.timestamp}</div>
    </div>
    <div class="detail-item" style="grid-column: 1 / -1;">
      <div class="detail-label">Validation Status / Checksum</div>
      <div class="detail-value">${item.checksum}</div>
    </div>
  `;

  jsonBox.textContent = item.rawManifest ? JSON.stringify(item.rawManifest, null, 2) : '// No C2PA manifest present (null_manifest)';

  modal.classList.add('open');
}

function closeInspectModal() {
  const modal = document.getElementById('inspect-modal');
  if (modal) {
    modal.classList.remove('open');
    const modalPreview = document.getElementById('modal-media-preview');
    if (modalPreview) modalPreview.innerHTML = '';
  }
}
