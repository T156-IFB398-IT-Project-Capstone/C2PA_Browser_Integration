# Build and deployment notes

**Baseline:** tag `v1.0.0-handover` (commit `6a1ea31`). No credentials, keys or
secrets are needed for anything in this document.

## 1. Developer setup

Requirements:
- **Node.js 20 or later.** CI uses Node 20, and the README notes the tests run on
  Node 20 and 24. The engine-level check needs **Node 22 or later**, for the
  built-in WebSocket.
- **Google Chrome** (or Chromium).

```bash
git clone https://github.com/T156-IFB398-IT-Project-Capstone/C2PA_Browser_Integration.git
cd C2PA_Browser_Integration
npm ci            # installs @contentauth/c2pa-web 0.13.1 exactly; postinstall builds c2pa-test-bench/verify-bundle.js
npm run build     # esbuild → extension/dist/service-worker.js and extension/dist/offscreen.js
npm run dev       # optional: rebuild on change + serve the test bench at http://127.0.0.1:8976
```

Load the extension:
1. Open `chrome://extensions` and switch on Developer mode.
2. Click **Load unpacked** and select the `extension/` folder.
3. Re-run `npm run build`, or keep `npm run dev` running, after changing anything in
   `extension/src/background/` or `extension/src/offscreen/`. Those two folders are
   bundled into `extension/dist/`. The content script, popup and detail page are
   loaded from `extension/src/` directly.

## 2. Build

`build.mjs` has two esbuild entries:
- `extension/src/background/service-worker.js` → `extension/dist/service-worker.js`
- `extension/src/offscreen/offscreen.js` → `extension/dist/offscreen.js`. This bundles c2pa-web in inline mode (the WASM is embedded as base64) and the trust-list PEMs (`.pem` text loader).

`extension/dist/` is git-ignored. The build produces **no zip or `.crx`**. The
stale `extension.crx` was removed in PR #29 and remains in git history.

## 3. Checks

| Command | What it checks | Runs in CI? |
|---|---|---|
| `node scripts/check-syntax.mjs` | Syntax of every source file, including classic scripts | yes |
| `npm test` | 174 unit tests in `tests/unit/` (Node built-in runner). The c2pa-web SDK is a stand-in, so these **do not exercise the engine**. | yes |
| `node tests/engine/run.mjs --out <dir>` | **Engine-level check**: the real verifier in headless Chrome over `test-assets/trusted/`; records states, raw SDK results and every network request | **no** (needs Chrome; run locally) |

CI is `.github/workflows/ci.yml`, job **"Build and static checks"**. It runs on every
PR to `main` and every push to `main`: `npm ci`, build, check the output exists,
syntax check, `npm test`. It is read-only (no secrets, no deploy).

CI is **not a required status check** on `main`. The only active ruleset blocks
deletion and force-push (`docs/phase2/branch-cleanup-report.md` §9).
Recommendation: make it required.

## 4. Release procedure (as used for `v1.0.0-handover`)

1. Every change goes in through a PR to `main`, with CI passing, merged with a merge
   commit. Nobody pushes to `main` directly.
2. Check that `main` is at the intended commit (`git ls-remote origin refs/heads/main`)
   and that the tag does not exist (`git tag -l`, `git ls-remote --tags origin`).
3. Do the fresh-clone verification (§5) on that exact commit.
4. Create an annotated tag on the verified SHA, push it, and create the GitHub
   Release from the release-notes file:
   ```bash
   git tag -a vX.Y.Z-handover <SHA> -m "<message>"
   git push origin vX.Y.Z-handover
   gh release create vX.Y.Z-handover --verify-tag --title "vX.Y.Z-handover" --notes-file docs/phase2/RELEASE_NOTES_vX.Y.Z-handover.md
   ```
5. Never move or delete a published tag. A fix becomes a new patch tag, e.g.
   `v1.0.1-handover`.

Record for `v1.0.0-handover`:
- The tag object is `41d8054`, on commit `6a1ea31` (PR #35 merge).
- The release was published 2026-10-19T05:13:17Z.
- The fresh-clone outputs are in `docs/genai-log/2026-10.md`.
- Manual UI checks were **pending at tag time**.

## 5. Fresh-clone verification

In an empty directory:

```bash
git clone --branch <tag-or-main> https://github.com/T156-IFB398-IT-Project-Capstone/C2PA_Browser_Integration.git verify
cd verify
git rev-parse HEAD                       # must equal the SHA to tag
npm ci
npm run build
node scripts/check-syntax.mjs
npm test
node tests/engine/run.mjs --out ../engine-check-<sha>
```

Then the manual checks (`docs/phase2/ui-test-checklist.md`):
1. Load unpacked in a clean Chrome profile
   (`chrome --user-data-dir=<new empty folder> --no-first-run`).
2. Toggle the ON/OFF switch.
3. Check the badges on `dev-test-library/gallery.html`. Serve the repository root
   with `python -m http.server 8080 --bind 127.0.0.1`, as the checklist describes.
4. Check an MP4 (`sora.MP4`).
5. Check a no-credentials image (`NO-C2PA-cloudmountain.jpg`).
6. Check `crater-lake.jpg`, which should read "Credentials online — not checked".

## 6. Test bench deployment

- **What it is:** `c2pa-test-bench/`. It is a static site that bundles the
  extension's real `verify()` (`verify-entry.mjs` → `verify-bundle.js`).
- **Build:** `npm ci` runs `node c2pa-test-bench/build.mjs` as its postinstall step.
  `verify-bundle.js` (about 11 MB, WASM embedded) is git-ignored and must be built
  before deploying.
- **Files the site needs, with `index.html` at the site root:**

  | Path on the site | Source |
  |---|---|
  | `/index.html`, `/style.css`, `/app.js`, `/verify-bundle.js` | `c2pa-test-bench/` |
  | `/assets/*` | `c2pa-test-bench/assets/` |
  | `/extension/src/popup/badges/*` | `extension/src/popup/badges/` |

  `app.js` loads the Shield badges from `../extension/src/popup/badges/`, which
  resolves to `/extension/src/popup/badges/` when `index.html` is at the site root.
- **Hosting:** c2patest.pages.dev (Cloudflare Pages). Jonah deploys it, and the
  repository contains **no deployment configuration or credentials**.
  - **The hosted copy is behind the repository.** On 19 Oct, the live `app.js`
    (ETag `539c9c5b…`) matched no version of `c2pa-test-bench/app.js` in git
    history, so it does not yet include `v1.0.0-handover`.
  - **Redeploying from the tag:** build from a clone of `v1.0.0-handover`
    (`npm ci`), then upload the layout above to the Pages project, e.g. with
    `npx wrangler pages deploy <dir> --project-name <project>`. That needs the
    owner's Cloudflare login, and wrangler is not a project dependency.
  - **After deploying:** run the fixtures on the live site and record the
    deployment.
  - The test bench's label table (`c2pa-test-bench/app.js`) has no entry for
    `remote_not_checked` yet, so it shows the raw status string. The owner is Jonah.

## 7. MaxBrowser install

**Not yet verified.** Only Chrome has been tested: Chrome 154 for the performance
run, and Chrome 155 for the engine-level check.

MaxBrowser is Chromium/Brave-based, so the expected steps are the same as for
Chrome. They are **unverified**:
1. Open the browser's extensions page (`chrome://extensions` or its equivalent).
2. Switch on developer mode.
3. Click **Load unpacked** and select `extension/`.

To record when it is tested:
- MaxBrowser version and OS,
- whether the extension loads,
- whether the ON/OFF switch works,
- whether badges appear on the gallery page,
- whether MP4 verification works,
- any differences from Chrome.
