# C2PA_BrowserIntegration

P917 | Databench Pty Ltd | C2PA Content Provenance Integration into a Web Browser

---


# Setup Guide

Step-by-step guide to get the C2PA browser extension running locally.

## What you'll need

* A  **Chromium-based browser** : Chrome, Edge, Brave, or Opera, etc.
* **Rust** 1.75 or newer — we'll install this below
* A project folder that is **NOT inside OneDrive, Dropbox, or iCloud** 

---

## 1. Install Rust

Rust ships with an installer called `rustup`.

### Windows

1. Download and run `rustup-init.exe` from [https://rustup.rs](https://rustup.rs/)
2. When prompted, choose **1) Proceed with installation (default)**
3. If prompted about  **Visual Studio Build Tools** , install them — Rust on Windows needs the MSVC linker
4. **Close your terminal and open a new one**
5. Verify:
   ```powershell
   cargo --versionrustc --version
   ```

### macOS / Linux

Open Terminal and run:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, choose  **1) Proceed with installation (default)** .

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

The Rust service does the actual C2PA verification. The browser extension talks to it over `localhost`.

Open a terminal in the project folder:

```bash
cd rust-service
cp .env.example .env       # macOS/Linux
# copy .env.example .env   # Windows PowerShell
cargo run
```

**The first run takes 2–5 minutes** — Cargo downloads and compiles all dependencies. You'll see many `Compiling xxx v0.x.x` lines. This is normal. Subsequent runs take a few seconds.

When ready, you'll see a banner like:

```
================================================================
[c2pa-service] Generated shared secret (save this in the extension popup):
[c2pa-service]   SHARED_SECRET=7f3a9b2c...c92bd4e1
================================================================

[c2pa-service] Listening on http://127.0.0.1:8901
```

**Copy the `SHARED_SECRET` value** — you'll paste it into the extension in the next step.

> Leave this terminal running. Pressing `Ctrl+C` stops the service.

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
5. The extension icon should appear in your browser toolbar

> If you don't see the icon, click the puzzle-piece icon in the toolbar and pin it.

---

## 5. Configure the shared secret

1. Click the extension icon — the popup opens
2. Click the **gear icon** (Settings) in the top-right of the popup
3. Paste the `SHARED_SECRET` value you copied earlier
4. Click **Save**
5. Click **Test connection**

If you see "Service online", you're ready.

---

## 6. Try it

1. Go to any web page with images
2. Click the extension icon
3. Click **Scan this page**
4. The popup lists detected images with their verification status

> The current verifier returns **mock results** — real `c2pa-rs` verification lands in Sprint 3. For now, JPEGs report as "verified — trusted" and PNGs as "verified — signer not trusted". This is intentional so we can exercise the full end-to-end pipeline.

---

## Troubleshooting

### `LNK1104: cannot open file` on Windows

**Cause:** the project is inside OneDrive (or another cloud-sync folder). OneDrive locks files while syncing, preventing the linker from writing binaries.

**Fix:** move the project out of OneDrive into a plain local folder like `C:\dev\`:

```powershell
move "C:\Users\<you>\OneDrive\path\to\project" C:\dev\
cd C:\dev\c2pa-browser-integration\rust-service
Remove-Item -Recurse -Force target    # clean old build artefacts
cargo run
```

Alternative: keep the source in OneDrive but move the build directory out:

```powershell
[Environment]::SetEnvironmentVariable("CARGO_TARGET_DIR", "C:\cargo-target", "User")
# Close PowerShell, open a new one, then cargo run
```

### `cargo: command not found`

Either the terminal hasn't been restarted since installing Rust, or `rustup` isn't on your `PATH`:

```bash
# macOS / Linux
source "$HOME/.cargo/env"

# Windows: just close PowerShell and open a new window
```

### `error: linker cc not found` on Linux

Install build tools:

```bash
sudo apt install build-essential pkg-config   # Ubuntu/Debian
sudo dnf install gcc                           # Fedora
```

### Extension says "Service unreachable"

1. Check the Rust service terminal is still running
2. Check it's on port `8901` (the banner tells you)
3. Check your firewall isn't blocking `localhost`
4. Open Settings in the extension and click **Test connection** to see the exact error

### Extension says "Unauthorized"

The shared secret in the extension doesn't match the one in the Rust service:

1. Find the secret in `rust-service/config.toml`
2. Paste it exactly into the extension Settings (no surrounding quotes)
3. Click  **Save** , then **Test connection**

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

Then update the extension to match by editing `extension/src/shared/constants.js` → `SERVICE_BASE_URL`.

### Extension doesn't pick up my code changes

Click the **reload** icon on the extension card at `chrome://extensions` after editing any file in `extension/`. The Rust service needs a full `Ctrl+C` + `cargo run` restart after editing Rust code.

---

## Stopping everything

* Press `Ctrl+C` in the Rust service terminal to stop the service
* Toggle the extension off at `chrome://extensions`, or click **Remove** to uninstall it

---

## Next steps

* [`README.md`](https://claude.ai/chat/README.md) — project overview and architecture diagram
* [`docs/ARCHITECTURE.md`](https://claude.ai/chat/docs/ARCHITECTURE.md) — hybrid design and threat model
* [`docs/API_CONTRACT.md`](https://claude.ai/chat/docs/API_CONTRACT.md) — IPC contract between the extension and the Rust service
* [`extension/README.md`](https://claude.ai/chat/extension/README.md) — extension dev workflow
* [`rust-service/README.md`](https://claude.ai/chat/rust-service/README.md) — Rust dev workflow
