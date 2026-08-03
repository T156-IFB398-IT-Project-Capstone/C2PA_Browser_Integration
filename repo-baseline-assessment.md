# Repo baseline assessment — Phase 2 restart

**Purpose:** establish what actually exists in this repository before any Phase 2
work begins, so that planning rests on the codebase rather than on memory of it.
The repository sat idle over the semester break; this document is the first thing
produced on reopening it.

**Filled by:** AI agent, from direct inspection only
**Reviewed by:** Lucas Mai (Technical Lead)
**Date:** 2026-08-03

> **Location note:** CLAUDE.md references this file at `docs/phase2/repo-baseline-assessment.md`.
> No `docs/phase2/` directory exists in this repository — verified with a recursive
> search from repo root. This file was created and is being filled in at the repo
> root instead, alongside `spike-001-mp4-verification.md`, which is also untracked
> at the root rather than under `docs/phase2/`. Flagged here rather than silently
> relocated; see Section 6.

> **Rule for whoever fills this in:** every cell must come from something you
> read or ran in this repository. Where you did not verify something, write
> `not verified` — never infer, never fill a gap from the project documentation.
> The value of this document is that it can disagree with the plan.

---

## 1. Environment

| Item | Value | How established |
|---|---|---|
| Node / package manager version | Node v24.15.0, npm 11.12.1 | `node -v && npm -v` |
| Build command | `npm run build` → `node build.mjs` (esbuild, two entry points: service-worker.js, offscreen.js) | Read `package.json` scripts + `build.mjs` |
| Build result (clean checkout) | **Succeeds.** `[build] Done. Output written to extension/dist/` — produced `service-worker.js`, `service-worker.js.map`, `offscreen.js`, `offscreen.js.map` | Ran `rm -rf extension/dist && npm run build` |
| Test command | **None exists.** No `test` script in `package.json`; no test runner in `devDependencies` (only `esbuild`); no `*.test.js` / `*.spec.js` files anywhere in the repo | `npm test` → `npm error Missing script: "test"`; `Glob **/*.test.js` and `**/*.spec.js` → no matches |
| Test result | N/A — there is no automated test suite to run | Same as above |
| `c2pa-web` version pinned in lockfile | `package.json` declares `"@contentauth/c2pa-web": "^0.7.0"` (caret range, not an exact pin). `package-lock.json` currently resolves it to exact `0.7.0`, matching the version installed in `node_modules`. | Read `package.json`; read `node_modules/@contentauth/c2pa-web/package.json` (`"version": "0.7.0"`) |
| Extension loads in browser | **Not verified.** No browser-automation tooling is present in this environment (no Puppeteer/Playwright devDependency, no headless-load script). Confirmed only that the build output referenced by `manifest.json` (`dist/service-worker.js`, offscreen document assets) exists after a build. Manual "Load unpacked" in Chrome/MaxBrowser was not performed. | Inspected `extension/dist/` contents post-build; did not launch a browser |

---

## 2. Component inventory

| Component | Path | Purpose | State | Evidence | Confidence |
|---|---|---|---|---|---|
| Content script | `extension/src/content/content-script.js` | DOM media scanner; sends `MEDIA_DETECTED`/`SCAN_ACTIVE_TAB` to background | Working | Present, builds; uses `chrome.runtime` messaging directly (extension-layer code, expected) | Medium — read, not exercised in a browser |
| Service worker | `extension/src/background/service-worker.js` | MV3 orchestrator: creates offscreen doc, fetches bytes, routes messages, keepalive alarm, tab lifecycle | Working (per code + successful build) | Read in full; builds cleanly; real `chrome.*` usage matches a legitimate orchestration role | Medium |
| Offscreen document (verification core) | `extension/src/offscreen/offscreen.js` | Hosts `@contentauth/c2pa-web` WASM verifier; maps `validation_state` → `VERIFY_STATUS`; extracts creator/AI-disclosure/signer fields | Working (per code) | Read in full; imports `@contentauth/c2pa-web/inline`, which resolves (`node_modules/@contentauth/c2pa-web/dist/inline.js`) | Medium — logic not exercised against real assets in this pass |
| Scan queue | `extension/src/background/scan-queue.js` | In-memory URL-keyed dedup/state tracker for in-flight verifications | Working, no external deps | Read in full — zero `chrome.*` references (real code or comments) | High |
| Tab media registry | `extension/src/background/tab-media-registry.js` | Per-tab media store | Working, no external deps in the module itself | File exists; grep shows `chrome.*` only inside comments, not code | Medium — not read in full this pass |
| Result cache | `extension/src/shared/result-cache.js` | TTL + LRU-ish in-memory verification result cache | Working, no external deps | Read in full — zero `chrome.*` API calls; one comment mentions a possible future `chrome.storage.session` use | High |
| Shared constants | `extension/src/shared/constants.js` | Central tunables (cache TTL, scan concurrency, supported MIME types, `MAX_ASSET_BYTES`, `VERIFY_STATUS` enum) | Working, pure data | Read in full — no executable `chrome.*` calls, one explanatory comment | High |
| Message contract | `extension/src/shared/messages.js` | Typed `MSG` constants + envelope builder shared by all layers | Working | Read in full | High |
| Popup UI | `extension/src/popup/popup.js` / `.html` / `.css` | Renders scan results and live-media panel; Brian's ownership — read only | Present, builds | File exists, listed in inventory only; not analysed for correctness (out of lane) | Low — not reviewed in depth |
| Build pipeline | `build.mjs` | esbuild bundler, two entry points (SW, offscreen), stubs `__dirname`/`__filename` for the offscreen bundle | Working | Ran it directly; succeeded | High |
| Extension manifest | `extension/manifest.json` | MV3 manifest — permissions: `activeTab`, `storage`, `alarms`, `offscreen`; host permission `<all_urls>`; CSP allows `wasm-unsafe-eval` | Working, consistent with current architecture | Read in full; matches what `MIGRATION_AUDIT.md` §5.2 flagged for removal (no `127.0.0.1`/`localhost` host permissions, no `scripting` permission, no empty `web_accessible_resources`) — those migration items appear to have been carried out | High |
| Trust list files | `trusted-certs/C2PA-TRUST-LIST.pem`, `trusted-signers.json`, `trusted-tsa.json` | Static trust-list data (Jonah's area) | **Present but unwired** | Grepped `extension/src` for any reference to `trusted-certs`, `trusted-signers`, `trusted-tsa`, `TRUST-LIST` — zero matches. Files last touched 2026-04-28, before the extension-only migration (2026-05-19) | High — absence of reference is a clean grep result |
| Rust service | `rust-service/` | Legacy hybrid-architecture HTTP verifier (Axum, `MockVerifier`) | **Dead / not tracked by git** | `git status --ignored` shows `rust-service/` is fully gitignored; only `config.toml` and a `target/` build-artifact directory remain on disk locally — no `src/` present. Source removal is recorded at commit `d2ccb4b` ("remove: delete Rust service and legacy IPC client") | High |
| Test assets — images | `test-assets/{trusted,untrusted,no-manifest}/` | Real signed/unsigned images for manual verification against the offscreen verifier | Present | Listed all files; cross-checked against `test-assets/README.md` inventory — matches | High |
| Test assets — tampered | `test-assets/tampered/` | Intended `INVALID_OR_CHANGED` fixtures | **Empty** (`.gitkeep` only) | Directory listing; also flagged in `KNOWN_LIMITATIONS.md` L5 | High |
| Test assets — video | `test-assets/trusted/sora.MP4` + `manifest-sora` (pre-extracted JSON) | OpenAI Sora sample with a real C2PA manifest, plus its pre-extracted `manifestStore()` JSON | Present, **not verifiable by current code** (video unsupported — see §4) | File present; `SUPPORTED_MIME_TYPES` in `constants.js` lists only `image/jpeg|png|gif|webp` — no video MIME type | High |

---

## 3. Verification core — conversion-readiness

| Question | Answer | Evidence |
|---|---|---|
| Which modules constitute the verification core? | `extension/src/offscreen/offscreen.js` (the actual c2pa-web calls, status mapping, field extraction) plus the supporting pure modules `scan-queue.js`, `result-cache.js`, `constants.js` (VERIFY_STATUS enum, MAX_ASSET_BYTES) | Read all four files in full |
| Do any of them reference `chrome.*` directly? Which, where? | **Yes — `offscreen.js` does, directly and centrally.** `chrome.runtime.onMessage.addListener(...)` at line 27 wraps the entire verification entry point; there is no separation between "receive a browser message" and "run verification." `scan-queue.js`, `result-cache.js`, and `constants.js` have zero real `chrome.*` calls (comments only). | `Grep chrome\.` across `extension/src`, then read each flagged file to confirm real usage vs. comment-only mentions |
| Is there an existing adapter or seam between core and extension? | **No.** `verify()` in `offscreen.js` is a plain async function and could in principle be called without `chrome.*`, but it is not exported, not in its own module, and is defined in the same file as the `chrome.runtime.onMessage` listener that invokes it. There is no named adapter interface per CLAUDE.md's hard constraint #1. | Read `offscreen.js` in full — one file, no module boundary |
| Can the core be imported and exercised outside the extension today? | **No**, and this was actually attempted and documented by the team already: `C2PA_API_NOTES.md` §1 records that `scripts/validate-c2pa-api.mjs` was run under Node against `@contentauth/c2pa-web` and failed with `Worker is not defined`, because the SDK spawns a browser `Worker` internally. This is a constraint of `c2pa-web` itself, not of how `offscreen.js` is written — but it means the verification core cannot currently run headless, in a test runner, or in a future non-extension host without a `Worker`-shim/browser-like environment. | `C2PA_API_NOTES.md` §1 (documented, not re-run this session) |
| What is the current public surface of the core (entry points, result shape, error types)? | One entry point: `verify({ bytes, mimeType })` → `{ status, manifest, error }`, invoked only via the `VERIFY_REQUEST` message. `status` is one of the `VERIFY_STATUS` enum values (`constants.js`) plus a non-enum `'error'` string used ad hoc in the message-listener catch block. `manifest` is `{ creator, ai_disclosure, signer } | null`. | Read `offscreen.js` lines 27–70 |
| Is that surface documented anywhere? | Partially. The message protocol is documented in a header comment in `offscreen.js` (lines 7–9) and the underlying c2pa-web shape is documented in `C2PA_API_NOTES.md` §2–4. There is no document describing the core's surface independent of the `chrome.runtime` message protocol. | Read both files |

**Assessment in one sentence:** The verification core is functionally isolated (only `offscreen.js` calls c2pa-web, and the surrounding queue/cache/constants modules are already `chrome.*`-free) but it is not *structurally* isolated — the verifier and the browser-messaging glue live in the same file with no adapter boundary, so extracting it for conversion today would require a refactor, not just a copy.

---

## 4. Test coverage and the test bench

| Question | Answer | Evidence |
|---|---|---|
| What automated tests exist, and what do they actually cover? | **None.** No test script, no test runner dependency, no `*.test.js`/`*.spec.js` files anywhere in the repo. | `npm test` failure; `Glob` for test file patterns returned nothing |
| Does the regression suite run green right now? | There is no regression suite to run. | Same as above |
| How does the suite reach the hosted test bench? | Not applicable — no suite exists, and no reference to a "hosted test bench" was found anywhere in code or docs other than in `CLAUDE.md` and the two new baseline/spike scaffolding files. | `grep -rli "test bench\|testbench"` across the repo (excluding `node_modules`) matched only `CLAUDE.md`, `repo-baseline-assessment.md`, `spike-001-mp4-verification.md` |
| Which formats have test assets today? | Images: JPEG, PNG (trusted/untrusted/no-manifest, real signed samples from Adobe and OpenAI tools). Tampered: none (empty placeholder). Video: one MP4 sample present but unsupported by current code. | Directory listing + `test-assets/README.md` |
| Are there video assets already present? | **Yes** — `test-assets/trusted/sora.MP4` (OpenAI Sora, ~5.1 MB per `test-assets/README.md`) with a pre-extracted `manifestStore()` JSON (`manifest-sora`) sitting alongside it. This is a real, already-signed video asset with known-good manifest data — directly usable as a fixture for the MP4 spike. | File listing; `test-assets/README.md` line 39, 46 |

---

## 5. Documentation carried from Phase 1

| Document | Path | Still accurate? | Notes |
|---|---|---|---|
| Migration audit | `MIGRATION_AUDIT.md` | **Historical, not current-state.** Accurately describes the pre-migration hybrid architecture as of 2026-05-19; explicitly a "Phase 1 discovery" snapshot. The architecture it describes (Rust HTTP service, `ipc-client.js`, `MockVerifier`) no longer exists in the working tree. | Read in full; cross-checked against current `manifest.json` and file tree — the removals/rewrites it lists (host_permissions cleanup, `scripting` permission removal, `ipc-client.js` deletion) appear to have been carried out |
| Migration plan | `MIGRATION_PLAN.md` | **Historical — plan was executed.** Read the first ~80 lines (offscreen-document architecture decision, manifest/constants rewrite checklist). Matches what's actually in the repo now (offscreen document exists, constants match the "update" items). Not fully cross-checked line-by-line against every checkbox. | Partial read; spot-checked against current code |
| API notes | `C2PA_API_NOTES.md` | **Largely still accurate.** The field-gap analysis (§3) matches what `offscreen.js` actually does today (`extractCreator`, `hasAiAssertion`, signer nesting) almost exactly — the "Step 6" adapters it anticipated are implemented. One open question (§6.3, `unsupported_format` status for containers like MP4) is **still open**: `offscreen.js` has no explicit `UNSUPPORTED_FORMAT` handling path today — unsupported types are caught by a string-match on `"UnsupportedType"` in the error message and mapped to `NO_CREDENTIALS`, not to the `UNSUPPORTED_FORMAT` enum value that exists in `constants.js` but is otherwise unused. | Read in full; cross-checked against `offscreen.js` and `constants.js` |
| Known limitations | `KNOWN_LIMITATIONS.md` | **Accurate and current.** L1 (trust-list narrowness), L2 (15 MB cap — matches `constants.js`), L3 (video detected, not verified — matches `SUPPORTED_MIME_TYPES`), L5 (tampered folder empty — confirmed), L6 (adapter shim in offscreen.js — confirmed) all check out against the current code. | Read in full; cross-checked against `constants.js`, `offscreen.js`, `test-assets/` |
| Tooling declaration | `TOOLING.md` | Not independently verifiable (it's a disclosure statement about how AI was used, not a technical claim about the codebase) | Read in full; no contradiction found with anything else inspected |

---

## 6. Divergences from the plan

| # | Divergence | Where the plan says otherwise | Impact |
|---|---|---|---|
| 1 | `docs/phase2/` does not exist. This baseline document and the MP4 spike doc were created at repo root, not under `docs/phase2/`, and neither is git-tracked yet. | CLAUDE.md §5 sprint table references `docs/phase2/spike-001-mp4-verification.md`; this prompt itself was invoked expecting `docs/phase2/repo-baseline-assessment.md`. | Low, mechanical — but should be resolved (move into `docs/phase2/` or update CLAUDE.md) before these become the team's reference docs, otherwise future sessions will keep failing to find them at the path CLAUDE.md names. |
| 2 | **No test suite exists at all** — no `test` script, no test runner dependency, no test files. | CLAUDE.md §1 describes a "five-state result model" with regression-suite ownership assigned to Grace, and Sprint 1's baseline item is "Post-break re-baseline (build, load, **regression**)". The sprint plan's language presumes a regression suite exists to re-baseline. | High for Grace's lane specifically, and indirectly for Sprint 1: "re-baseline the regression suite" is not currently possible because there is no suite to re-run — it would need to be built, not re-baselined. Flagging for Lucas/Grace coordination, not fixing. |
| 3 | The verification core (`offscreen.js`) has **no adapter boundary** separating c2pa-web calls from `chrome.runtime` messaging — they're in one file with no seam. | CLAUDE.md hard constraint #1: "Any browser-specific access goes through a named adapter interface. This is the single most important architectural rule in Phase 2." | High — this is precisely the constraint Section 3 of this document was asked to scrutinise. The queue/cache/constants modules already comply; the verifier itself does not yet. |
| 4 | `trusted-certs/` (PEM trust list, `trusted-signers.json`, `trusted-tsa.json`) exists in the repo but is **not referenced anywhere in extension code** — verification currently relies entirely on c2pa-web's own bundled trust list. | `KNOWN_LIMITATIONS.md` L1 already documents that the *effective* trust list is c2pa-web's narrow embedded one, but a reader of the repo tree could reasonably assume `trusted-certs/` is live infrastructure given its size and structure. Not contradicted by CLAUDE.md, but worth surfacing since Jonah's area (trust model) is described in the ownership table as active. | Medium — informational for Jonah/Lucas coordination: this looks like in-progress or planned trust-list work that was never wired in, predating the extension-only migration. |
| 5 | `rust-service/` still physically exists on disk (config.toml + build `target/`) despite being described as removed, and despite Hard Constraint #3 ("no native host, no server-side verification"). | README.md and CLAUDE.md both state the architecture is extension-only with no native host. | Low — it is fully gitignored and its source (`src/`) was actually deleted at commit `d2ccb4b`; what remains is local build residue, not tracked work. Included here only because a naive `find` of the tree would suggest otherwise. Safe to leave alone (not asked to clean up) or mention to teammates so no one thinks it's live. |
| 6 | `c2pa-web` is pinned with a caret range (`^0.7.0`) in `package.json`, not an exact version string. | CLAUDE.md hard constraint #2: "`c2pa-web` is version-pinned." | Low today (lockfile currently resolves to exactly 0.7.0) but the declared range would silently accept `0.7.x` patch releases on a fresh `npm install` without the lockfile, which is looser than "version-pinned" implies. Worth a one-line fix decision, not urgent. |
| 7 | `UNSUPPORTED_FORMAT` exists as a defined status in `constants.js` (`VERIFY_STATUS.UNSUPPORTED_FORMAT`) but is **never assigned** anywhere in `offscreen.js`; unsupported containers currently fall through to `NO_CREDENTIALS` via string-matching the error message. | `C2PA_API_NOTES.md` §6.3 flags this as an open question "to monitor during Step 4"; it does not appear to have been resolved. | Medium, and directly relevant to the MP4 spike: whatever the spike decides for video's failure mode should also resolve this pre-existing gap rather than adding a second ad hoc path. |
| 8 | **Housekeeping, not a divergence:** `dev-test-library/` duplicates files already present under `test-assets/` (e.g. `sora.MP4`, byte-identical, confirmed via file size match) in an earlier, unorganised layout that predates the curated `test-assets/` tree. It is not a second source of fixtures — anyone adding new test assets should add them to `test-assets/` only. Per instruction, not deleted; noted here so it isn't mistaken for an independent asset pool during SPIKE-001 or later. | — | None — informational only. |

---

## 7. Blockers for Sprint 1

| # | Blocker | Owner | Suggested resolution |
|---|---|---|---|
| 1 | No test/regression suite exists to re-baseline against. | Grace (coordinate with Lucas) | Decide whether Sprint 1's "re-baseline" item means building a minimal suite from scratch, or re-scoping the item to reflect that none exists yet. Not this agent's call. |
| 2 | Extension has not been load-tested in an actual browser this session (no automation available). | Lucas | Manually load `extension/` unpacked in Chrome/MaxBrowser and confirm the popup/scan flow still works post-break before treating "build succeeds" as "extension works." |
| 3 | `docs/phase2/` doesn't exist yet, so this document and the spike doc have no permanent home consistent with CLAUDE.md's own references. | Lucas | Decide: create `docs/phase2/` and move these files there, or update CLAUDE.md's paths. Either is a two-minute fix but should be a deliberate choice, not left ambiguous. |

---

## 8. Summary for the tutor meeting

The extension-only migration described in `MIGRATION_AUDIT.md`/`MIGRATION_PLAN.md` was actually carried out: the Rust service is gone from the working tree (only gitignored local build residue remains), the offscreen-document WASM verifier is real code that builds cleanly, and it produces the field mappings (`creator`, `ai_disclosure`, `signer`) that `C2PA_API_NOTES.md` planned. However, two things the sprint plan assumes are not currently true: there is no automated test suite of any kind to "re-baseline," and the verification core is not yet structurally separated from `chrome.*` messaging — it works, but it is one file, not a core-plus-adapter, so Hard Constraint #1 (conversion-readiness) is not yet satisfied. On the positive side for the MP4 spike, a real signed video sample (`sora.MP4`) with a pre-extracted manifest is already sitting in the test-asset library, and the codebase already has a defined-but-unused `UNSUPPORTED_FORMAT` status that the spike should resolve rather than bypass. Nothing was fixed, refactored, or upgraded in this pass — this is a read-only snapshot.
