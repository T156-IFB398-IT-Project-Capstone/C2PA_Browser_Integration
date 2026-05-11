# C2PA Browser Integration — Setup Guide

P917 | Databench Pty Ltd | C2PA Content Provenance Integration into a Web Browser

Step-by-step guide to get the C2PA browser extension running locally.

---

## What you'll need

- A **Chromium-based browser**: Chrome, Edge, Brave, or Opera
- **Rust** 1.75 or newer — instructions below
- A project folder that is **NOT inside OneDrive, Dropbox, or iCloud**

---

## 1. Install Rust

Rust ships with an installer called `rustup`.

### Windows

1. Download and run `rustup-init.exe` from [https://rustup.rs](https://rustup.rs/)
2. When prompted, choose **1) Proceed with installation (default)**
3. If prompted about **Visual Studio Build Tools**, install them — Rust on Windows needs the MSVC linker
4. **Close your terminal and open a new one**
5. Verify:

   ```powershell
   cargo --version
   rustc --version
   ```

### macOS / Linux

Open Terminal and run:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, choose **1) Proceed with installation (default)**.

Close your terminal, open a new one, and verify:

```bash
cargo --version
rustc --version
```

Both commands should print a version of `1.75` or higher.

---

## 2. Get the code

Clone the repo somewhere **outside** any cloud-sync folder (OneDrive, Dropbox, iCloud):

```bash
# Recommended locations
#   Windows:  C:\dev\
#   macOS:    ~/projects/
#   Linux:    ~/dev/

cd C:\dev                          # or your chosen dev folder
git clone <REPO_URL> c2pa-browser-integration
cd c2pa-browser-integration
```

> **Do not put the project inside OneDrive.** Rust creates thousands of build files under `target/`, and cloud-sync tools will lock them while the linker is writing, producing `LNK1104` errors.

---

## 3. Start the Rust service

The Rust service performs the actual C2PA verification. The browser extension communicates with it over `localhost`.

Open a terminal in the project folder:

```bash
cd rust-service
cp .env.example .env       # macOS/Linux
# copy .env.example .env   # Windows PowerShell
cargo run
```

**The first run takes 2–5 minutes** — Cargo downloads and compiles all dependencies. You'll see many `Compiling xxx v0.x.x` lines. This is normal. Subsequent runs take a few seconds.

When ready, you'll see:

```
================================================================
[c2pa-service] Generated shared secret (save this in the extension popup):
[c2pa-service]   SHARED_SECRET=7f3a9b2c...c92bd4e1
================================================================

[c2pa-service] Listening on http://127.0.0.1:8901
```

**Copy the `SHARED_SECRET` value** — you'll paste it into the extension in the next step.

> Leave this terminal running. Press `Ctrl+C` to stop the service.

### Quick health check (optional)

Open a second terminal and run:

```bash
curl http://127.0.0.1:8901/api/v1/health
```

You should see:

```json
{"status":"ok","version":"0.1.0"}
```

---

## 4. Load the extension in your browser

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`, etc.)
2. Toggle **Developer mode** ON in the top-right corner
3. Click **Load unpacked**
4. Select the `extension/` folder inside the project
5. The extension icon appears in your browser toolbar

> If you don't see the icon, click the puzzle-piece icon in the toolbar and pin it.

---

## 5. Configure the shared secret

1. Click the extension icon — the popup opens
2. Click the **⚙ gear icon** (Settings) in the top-right of the popup
3. Paste the `SHARED_SECRET` value you copied in step 3
4. Click **Save**
5. Click **Test connection**

If you see "Service online (v0.1.0)", you're ready.

---

## 6. Try it

### Scan for Content Credentials

1. Go to any web page with images
2. Click the extension icon — the **Scan Results** tab is shown by default
3. Click **Scan this page**
4. The popup lists detected images with their C2PA verification status

> The current verifier returns **mock results**: JPEGs report as `verified_trusted`, PNGs as `verified_untrusted`. This is intentional — the full pipeline is wired end-to-end so real `c2pa-rs` verification can be slotted in without UI changes.

### Live Media Tracking (Sprint 3/4 feature)

1. Go to any web page
2. Click the extension icon
3. Click the **Live Media** tab
4. The panel populates automatically as the page loads — no scan needed
5. Scroll the page or interact with a SPA; new media (images, videos, audio) appears within ~3 seconds
6. The badge count on the tab button updates in real time

The live panel detects: images, video sources and posters, audio sources, and blob URLs.
Items marked **verifiable** (green badge) can also be sent through the Scan Results flow for C2PA credential checking.

---

## Troubleshooting

### `LNK1104: cannot open file` on Windows

**Cause:** the project is inside OneDrive or another cloud-sync folder. OneDrive locks files while syncing, preventing the linker from writing binaries.

**Fix:** move the project to a plain local folder:

```powershell
move "C:\Users\<you>\OneDrive\path\to\project" C:\dev\
cd C:\dev\c2pa-browser-integration\rust-service
Remove-Item -Recurse -Force target    # clean old build artefacts
cargo run
```

Alternative — keep source in OneDrive but redirect the build directory:

```powershell
[Environment]::SetEnvironmentVariable("CARGO_TARGET_DIR", "C:\cargo-target", "User")
# Close PowerShell, open a new window, then cargo run
```

### `cargo: command not found`

Either the terminal wasn't restarted after installing Rust, or `rustup` isn't on your `PATH`:

```bash
# macOS / Linux
source "$HOME/.cargo/env"

# Windows: close PowerShell and open a new window
```

### `error: linker cc not found` on Linux

Install build tools:

```bash
sudo apt install build-essential pkg-config   # Ubuntu/Debian
sudo dnf install gcc                           # Fedora
```

### Extension shows "Service unreachable" / "Backend not running"

1. Check the Rust service terminal is still running
2. Confirm it's listening on port `8901` (shown in the startup banner)
3. Check your firewall isn't blocking `localhost`
4. Open Settings in the extension and click **Test connection** to see the exact error

The popup's offline guide also shows the exact `cargo run` command when the service is down.

### Extension says "Unauthorized"

The shared secret in the extension doesn't match the one in the Rust service:

1. Find the secret in `rust-service/config.toml`
2. Paste it exactly into the extension Settings (no surrounding quotes)
3. Click **Save**, then **Test connection**

### Port 8901 is already in use

Run the service on a different port:

```bash
# macOS / Linux
export C2PA_SERVICE_PORT=8902
cargo run

# Windows PowerShell
$env:C2PA_SERVICE_PORT="8902"
cargo run
```

Then update `SERVICE_BASE_URL` in `extension/src/shared/constants.js` to match.

### Extension doesn't pick up my code changes

Click the **reload** icon on the extension card at `chrome://extensions` after editing any file in `extension/`. Rust code changes require a full `Ctrl+C` + `cargo run` restart.

### Live Media panel is empty

- The content script runs at `document_idle`. On a blank or restricted page (e.g., `chrome://` URLs) it does not inject.
- On a normal page: wait 2–3 seconds after load, then check again. The MutationObserver sends updates after a 1 s debounce + 2 s rate limit.
- If the panel stays empty, try reloading the page with the extension active.

---

## Stopping everything

- Press `Ctrl+C` in the Rust service terminal to stop the service
- Toggle the extension off at `chrome://extensions`, or click **Remove** to uninstall

---

## Further reading

- [`README.md`](README.md) — project overview and architecture diagram
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — hybrid design, tracking pipeline, and threat model
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — IPC contract between the extension and the Rust service
- [`extension/README.md`](extension/README.md) — extension developer workflow
- [`rust-service/README.md`](rust-service/README.md) — Rust service developer workflow
