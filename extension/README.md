# Extension — C2PA Content Credentials

Chromium Manifest V3 extension. Plain JavaScript, no bundler — files load directly.

## Layout

```
extension/
├── manifest.json
├── icons/                       Add icon-16/32/48/128.png here
└── src/
    ├── background/
    │   └── service-worker.js    Orchestration, fetches, IPC to Rust service
    ├── content/
    │   └── content-script.js    DOM scanner
    ├── popup/
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    └── shared/
        ├── constants.js         Environment constants, enums
        ├── messages.js          Typed runtime messages
        └── ipc-client.js        Fetch client for the Rust service
```

## Developer loop

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select this folder
4. After any file change: click the **reload** icon on the extension card

### Debugging

- **Service worker logs:** click the "service worker" link on the extension card → DevTools
- **Content script logs:** open DevTools on the target page → Console
- **Popup logs:** right-click the popup → Inspect

## Icons

Drop 16/32/48/128 px PNGs into `icons/`. For a quick placeholder on macOS/Linux:

```bash
# Any PNG works. ImageMagick example:
convert -size 128x128 xc:#2E75B6 -gravity center \
  -fill white -pointsize 72 -annotate 0 "⎈" icons/icon-128.png
convert icons/icon-128.png -resize 48x48 icons/icon-48.png
convert icons/icon-128.png -resize 32x32 icons/icon-32.png
convert icons/icon-128.png -resize 16x16 icons/icon-16.png
```

The extension will still load without icons (Chrome renders a default puzzle piece), but publishing / screenshots need them.

## Conventions

- **ES modules in the background + popup.** `content-script.js` stays IIFE because content scripts can't use ESM imports in MV3.
- **Typed messages.** Always use the `MSG` enum in `shared/messages.js` — never raw strings.
- **Storage keys** live in `STORAGE_KEYS` (same file) to avoid typos leaking into prod.
- **No inline scripts** in HTML (CSP forbids it).
