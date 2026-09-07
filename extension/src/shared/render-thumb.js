// src/shared/render-thumb.js
//
// Result thumbnail + Shield badge, as real DOM nodes. Shared by the popup
// and the detail page (extension/src/detail/) so a given result renders
// identically — same media, same badge — wherever it's shown. Uses
// chrome.runtime.getURL() for badge asset paths rather than a relative
// path, since the two consumers live at different directory depths and
// this way works from either without per-caller path juggling.

import { BADGE_FILES, pickBadgeState } from './badge-map.js';

function badgeUrl(file) {
  return chrome.runtime.getURL(`src/popup/badges/${file}`);
}

function kindIcon(kind) {
  switch (kind) {
    case 'video':
    case 'video-poster': return '▶';
    case 'audio':        return '♪';
    default:             return '?';
  }
}

export function renderShieldBadge(item) {
  const state = pickBadgeState(item);
  if (!state) return null;
  const { file, alt } = BADGE_FILES[state];
  const badge = document.createElement('img');
  badge.className = 'shield-badge';
  badge.src   = badgeUrl(file);
  badge.alt   = alt;
  badge.title = alt;
  return badge;
}

// <img> for images, a muted inline <video> for video (an <img> pointed at a
// video URL always fails silently), a kind icon otherwise. Wrapped in a
// positioned container so the Shield badge can sit in the corner regardless
// of media kind.
//
// opts.interactive: false (default) is a small non-interactive preview —
// no controls, muted (used inline on a clickable card, where playback
// controls would intercept the click meant to open the detail page).
// true adds real controls and sound, for a standalone detail view where
// watching the video is the point.
export function renderThumb(item, opts = {}) {
  const { interactive = false } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'result-thumb-wrap';

  const url  = item.src || item.sourceUrl || '';
  const kind = item.kind;

  if (kind === 'video' && url && !url.startsWith('blob:')) {
    const video = document.createElement('video');
    video.className = 'result-thumb';
    video.src = url;
    video.preload = 'metadata';
    if (interactive) {
      video.controls = true;
    } else {
      video.muted = true;
    }
    video.onerror = () => { video.style.visibility = 'hidden'; };
    wrap.appendChild(video);
  } else if (url && !url.startsWith('blob:') && kind !== 'audio') {
    const img = document.createElement('img');
    img.className = 'result-thumb';
    img.src     = url;
    img.alt     = item.alt || '';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    wrap.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className   = 'media-icon';
    icon.textContent = kindIcon(kind);
    icon.setAttribute('aria-label', kind ?? 'unknown');
    wrap.appendChild(icon);
  }

  const badge = renderShieldBadge(item);
  if (badge) wrap.appendChild(badge);

  return wrap;
}
