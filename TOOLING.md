# Development Tooling Declaration

This document declares the development tools used in producing this IT Capstone project,
in line with QUT's expectations for academic transparency.

---

## AI-assisted development

Portions of the codebase — particularly the extension-only architecture migration documented
in `MIGRATION_AUDIT.md` and `MIGRATION_PLAN.md` — were developed with assistance from
Anthropic's Claude (Claude Code, VS Code extension).

### How AI was used

- **Codebase analysis and migration planning** — reviewing the existing hybrid architecture,
  identifying dead code, and drafting the step-by-step migration plan
- **Boilerplate generation** — offscreen document scaffold (`offscreen.html`, `offscreen.js`),
  esbuild build pipeline (`build.mjs`), initial service worker restructure
- **Iterative refactoring** — `service-worker.js`, `popup.js`, `popup.html`, and shared
  modules (`constants.js`, `messages.js`) across Steps 3–6 of the migration
- **Bug diagnosis** — identifying the `ArrayBuffer` serialisation bug in
  `chrome.runtime.sendMessage` (Step 4.1 patch) and the `chrome.offscreen.hasDocument`
  undefined error caused by the missing `"offscreen"` permission (Step 5)
- **Documentation drafting** — `KNOWN_LIMITATIONS.md`, `MIGRATION_AUDIT.md`,
  `MIGRATION_PLAN.md`, `C2PA_API_NOTES.md`, and this file

### How AI was NOT used

- **Architectural decisions** — the offscreen document pattern, inline WASM mode, and
  15 MB asset cap were chosen by team members after independently researching Chrome MV3
  constraints, the C2PA standard, and the `@contentauth/c2pa-web` SDK documentation
- **Code review** — all AI-generated code changes were reviewed by team members before
  being committed; the git history reflects this review loop
- **Industry-partner communication** — all communication with Databench Pty Ltd and
  supervisor Steven was conducted directly by team members
- **Test asset curation** — test images were sourced from Adobe Content Credentials
  web inspector, OpenAI, and public C2PA sample repositories; the trust-state findings
  (§ `test-assets/README.md`) were observed and documented by the team
- **Runtime testing** — all end-to-end smoke tests (popup UI, DevTools console, manifest
  field verification) were run and interpreted by team members

### Team member responsible for AI-tool oversight

Van Thien Phuoc Mai (Lucas) — n11642556

---

## Other tools used

| Tool | Purpose |
| --- | --- |
| VS Code | Editor with Claude Code extension |
| esbuild | Extension bundling (service worker + offscreen document) |
| Git + GitHub | Version control and branch management |
| Chrome DevTools | Service worker, offscreen, and popup debugging |
| Adobe Content Credentials Inspector | Extracting reference manifests for test assets |
| `@contentauth/c2pa-web` (npm) | Browser WASM C2PA verification SDK |
