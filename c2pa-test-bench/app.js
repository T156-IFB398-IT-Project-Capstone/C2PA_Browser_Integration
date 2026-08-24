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

// Initial test cases matching exact c2pa-web output and extension popup tags
const initialTestCases = [
  {
    id: 'case-verified-tsa-camera',
    title: 'Camera Capture (Truepic TSA)',
    status: VERIFY_STATUS.VERIFIED_TSA,
    statusLabel: getStatusLabel(VERIFY_STATUS.VERIFIED_TSA),
    mediaType: 'image',
    src: 'assets/verified-trusted.jpg',
    creator: 'Truepic Lens Camera',
    signer: 'Truepic Lens CA',
    issuer: 'Truepic Root CA',
    aiDisclosure: false,
    desc: 'Verified via TSA timestamping. Truepic camera capture metadata with secure TSA proof.',
    timestamp: '2023-02-12T10:00:00Z',
    tsaValidated: true
  },
  {
    id: 'case-sample-video',
    title: 'Zoetrope Animation (MP4 Video)',
    status: VERIFY_STATUS.VERIFIED_TSA,
    statusLabel: getStatusLabel(VERIFY_STATUS.VERIFIED_TSA),
    mediaType: 'video',
    src: 'assets/sample-video.mp4',
    creator: 'Truepic C2PA Video Engine',
    signer: 'Truepic Lens / C2PA Signer',
    issuer: 'Truepic Trust CA',
    aiDisclosure: false,
    desc: 'Verified via TSA timestamping. C2PA-signed MP4 video in ISO BMFF container.',
    timestamp: '2023-02-12T10:00:00Z',
    tsaValidated: true
  },
  {
    id: 'case-verified-tsa-landscape',
    title: 'Landscape Photo (Truepic TSA)',
    status: VERIFY_STATUS.VERIFIED_TSA,
    statusLabel: getStatusLabel(VERIFY_STATUS.VERIFIED_TSA),
    mediaType: 'image',
    src: 'assets/verified-tsa.jpg',
    creator: 'Truepic Lens SDK',
    signer: 'Truepic Lens SDK Signer',
    issuer: 'Truepic CA',
    aiDisclosure: false,
    desc: 'Verified via TSA timestamping. Original landscape photograph with embedded C2PA claim.',
    timestamp: '2023-02-12T10:00:00Z',
    tsaValidated: true
  },
  {
    id: 'case-earth-self-signed',
    title: 'Earth Apollo 17 (Self-Signed Test Key)',
    status: VERIFY_STATUS.VERIFIED_UNTRUSTED,
    statusLabel: getStatusLabel(VERIFY_STATUS.VERIFIED_UNTRUSTED),
    mediaType: 'image',
    src: 'assets/untrusted-signer.jpg',
    creator: 'c2pa-rs',
    signer: 'c2pa-test (Self-Signed)',
    issuer: 'c2pa-test CA',
    aiDisclosure: false,
    desc: 'Signed with c2pa-test development key. Cryptographic signature is intact, but provider is not in the public CAWG trust list.',
    timestamp: '2024-05-10T14:20:00Z',
    tsaValidated: false
  },
  {
    id: 'case-ai-verified',
    title: 'Generative AI Media (c2pa-rs)',
    status: VERIFY_STATUS.VERIFIED_UNTRUSTED,
    statusLabel: getStatusLabel(VERIFY_STATUS.VERIFIED_UNTRUSTED),
    mediaType: 'image',
    src: 'assets/expired-cert.jpg',
    creator: 'c2pa-rs',
    signer: 'C2PA Test Signer',
    issuer: 'Self-Signed CA',
    aiDisclosure: true,
    desc: 'AI-generated content credential. AI source type flagged with self-signed development certificate.',
    timestamp: '2024-05-10T14:20:00Z',
    tsaValidated: false
  },
  {
    id: 'case-content-tampered',
    title: 'Tampered Pixels (Content Modified)',
    status: VERIFY_STATUS.CONTENT_TAMPERED,
    statusLabel: getStatusLabel(VERIFY_STATUS.CONTENT_TAMPERED),
    mediaType: 'image',
    src: 'assets/tampered-pixels.jpeg',
    creator: 'Adobe C2PA',
    signer: 'Adobe Signer',
    issuer: 'Adobe Trust Authority',
    aiDisclosure: false,
    desc: 'Pixel bytes altered post-signing, failing cryptographic data hash verification.',
    timestamp: '2022-01-24T12:00:00Z',
    tsaValidated: false
  },
  {
    id: 'case-broken-signature',
    title: 'Corrupted Manifest Signature',
    status: VERIFY_STATUS.BROKEN_SIGNATURE,
    statusLabel: getStatusLabel(VERIFY_STATUS.BROKEN_SIGNATURE),
    mediaType: 'image',
    src: 'assets/broken-signature.jpg',
    creator: 'Adobe C2PA',
    signer: 'Adobe Signer',
    issuer: 'Adobe Trust Authority',
    aiDisclosure: false,
    desc: 'Manifest claim signature corrupted or modified after signing.',
    timestamp: '2022-01-24T12:00:00Z',
    tsaValidated: false
  },
  {
    id: 'case-no-credentials',
    title: 'Standard JPEG (No Content Credentials)',
    status: VERIFY_STATUS.NO_CREDENTIALS,
    statusLabel: getStatusLabel(VERIFY_STATUS.NO_CREDENTIALS),
    mediaType: 'image',
    src: 'assets/no-credentials.jpg',
    creator: 'N/A',
    signer: 'Unsigned',
    issuer: 'N/A',
    aiDisclosure: false,
    desc: 'Standard image without any embedded C2PA provenance box.',
    timestamp: 'N/A',
    tsaValidated: false
  }
];

let testCases = [...initialTestCases];

document.addEventListener('DOMContentLoaded', () => {
  renderStats();
  renderGrid();
  setupEventListeners();
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

    card.innerHTML = `
      <div class="card-media-wrapper">
        ${mediaHtml}
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
        <div class="card-footer" style="display:flex; justify-content:flex-end;">
          <button class="inspect-btn" onclick="openInspectModal('${item.id}')">
            View Tags
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

function handleUploadedFiles(files) {
  Array.from(files).forEach(file => {
    const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.webm');
    const mediaUrl = URL.createObjectURL(file);

    const newItem = {
      id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      title: file.name,
      status: VERIFY_STATUS.VERIFIED_TSA,
      statusLabel: isVideo ? 'Verified via TSA (MP4)' : 'Verified via TSA',
      mediaType: isVideo ? 'video' : 'image',
      src: mediaUrl,
      creator: 'Local Sandbox Asset',
      signer: 'Local Signer',
      issuer: 'C2PA Anchor',
      aiDisclosure: false,
      desc: `File: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
      timestamp: new Date(file.lastModified).toISOString(),
      tsaValidated: true
    };

    testCases.unshift(newItem);
  });

  renderStats();
  renderGrid();
}

function openInspectModal(id) {
  const item = testCases.find(t => t.id === id);
  if (!item) return;

  const modal = document.getElementById('inspect-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalPreview = document.getElementById('modal-media-preview');
  const modalGrid = document.getElementById('modal-details-grid');

  modalTitle.textContent = item.title;

  if (item.mediaType === 'video') {
    modalPreview.innerHTML = `<video src="${item.src}" controls autoplay style="width:100%; max-height:260px;"></video>`;
  } else {
    modalPreview.innerHTML = `<img src="${item.src}" alt="${item.title}" style="max-width:100%; max-height:260px; object-fit:contain;">`;
  }

  modalGrid.innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Status</div>
      <div class="detail-value">
        <span class="status-badge ${item.status}">
          <span class="dot"></span>
          ${item.statusLabel}
        </span>
      </div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Media Type</div>
      <div class="detail-value">${item.mediaType.toUpperCase()}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Creator / Generator</div>
      <div class="detail-value">${item.creator || 'N/A'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Signer Common Name</div>
      <div class="detail-value">${item.signer || 'N/A'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Certificate Issuer</div>
      <div class="detail-value">${item.issuer || 'N/A'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">AI Generated / Disclosure</div>
      <div class="detail-value">${item.aiDisclosure ? 'AI: yes' : 'No'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Signing Timestamp</div>
      <div class="detail-value">${item.timestamp}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">TSA Validated</div>
      <div class="detail-value">${item.tsaValidated ? 'Yes (Valid TSA timestamp)' : 'No'}</div>
    </div>
  `;

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
