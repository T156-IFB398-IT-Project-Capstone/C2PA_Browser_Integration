# Extension — C2PA Content Credentials

Chromium Manifest V3 extension. Plain JavaScript, no bundler — files load directly from disk.

## Layout

```text
extension/
├── manifest.json
├── icons/                          Add icon-16/32/48/128.png here
└── src/
    ├── background/
    │   ├── service-worker.js       Orchestration, verification pipeline, health polling
    │   ├── scan-queue.js           URL-keyed in-flight deduplication (Sprint 4 prep)
    │   └── tab-media-registry.js   Per-tab realtime media store (Sprint 3/4)
    ├── content/
    │   └── content-script.js       DOM scanner + MutationObserver; IIFE, no ESM
    ├── popup/
    │   ├── popup.html              Scan Results + Live Media tab UI
    │   ├── popup.css
    │   └── popup.js
    └── shared/
        ├── constants.js            Tunable values, enums — single source of truth
        ├── messages.js             Typed runtime message bus
        ├── ipc-client.js           Fault-tolerant Rust service client (timeout/retry/CB)
        └── result-cache.js         TTL-based verification result cache (Sprint 4 prep)
```

## Developer loop

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. After any file change: click the **reload** icon on the extension card

### Debugging

- **Service worker logs:** click the "service worker" link on the extension card → DevTools Console
- **Content script logs:** open DevTools on the target page → Console → filter `[C2PA`
- **Popup logs:** right-click the popup → Inspect → Console

## Key design decisions

### Two-path media detection

The content script maintains two separate discovery functions:

- `discoverMedia()` — Sprint 1/2/3 verification path. Returns only verifiable image URLs (JPEG, PNG, GIF, WebP with recognised extensions). Used exclusively by the `SCAN_ACTIVE_TAB` handler. Never modified — preserves full backward compatibility.
- `discoverAllMedia()` — Sprint 3/4 tracking path. Returns all media regardless of format: images, `<video>` sources and posters, `<audio>` sources, and `blob:` URLs. Feeds the `TabMediaRegistry` via `MEDIA_DETECTED` messages.

### Message bus

All inter-component communication uses typed constants from `shared/messages.js`:

| Direction | Message | Payload |
| --- | --- | --- |
| content → background | `MEDIA_DETECTED` | `{ media[], pageUrl }` |
| popup → background | `SCAN_ACTIVE_TAB` | — |
| popup → background | `GET_TAB_MEDIA` | — |
| popup → background | `TEST_SERVICE` | — |
| popup → background | `GET_LAST_RESULT` | — |
| background → popup | `SCAN_PROGRESS` | `{ done, total }` |
| background → popup | `HEALTH_STATUS_CHANGED` | `{ ok, version, ts }` |
| background → popup | `MEDIA_UPDATED` | `{ tabId, media[], pageUrl, count }` |

### IPC reliability stack

Every call to the Rust service passes through three layers (in `ipc-client.js`):

1. **Circuit breaker** — open after 3 consecutive failures; reopens after 15 s cooldown
2. **AbortController timeout** — hard 10 s deadline on every `fetch()`
3. **Exponential backoff retry** — up to 3 total attempts; 400 ms → 800 ms delays

### MV3 keepalive

Chrome terminates idle Service Workers after ~30 s. A `chrome.alarms` alarm fires every 24 s to keep the SW active. An `ensureAlarms()` guard is called at module load, `onInstalled`, `onStartup`, and on every incoming message.

## Conventions

- **ES modules in background + popup.** `content-script.js` must stay an IIFE — content scripts cannot use ESM imports in MV3.
- **Typed messages.** Always use the `MSG` enum from `shared/messages.js` — never raw strings.
- **Storage keys** live in `STORAGE_KEYS` inside `constants.js` to avoid typos.
- **No inline scripts** in HTML (extension CSP forbids it).
- **No bundler.** Imports use relative `.js` paths so Chrome can load files directly. Keep the module graph shallow.

## Icons

Drop `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` into `icons/`. For a quick placeholder on macOS/Linux:

```bash
# Requires ImageMagick
convert -size 128x128 xc:#2E75B6 -gravity center \
  -fill white -pointsize 72 -annotate 0 "⎈" icons/icon-128.png
convert icons/icon-128.png -resize 48x48 icons/icon-48.png
convert icons/icon-128.png -resize 32x32 icons/icon-32.png
convert icons/icon-128.png -resize 16x16 icons/icon-16.png
```

The extension loads without icons (Chrome renders a puzzle piece), but screenshots and publishing require them.
