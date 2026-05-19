# Development Tooling Declaration

In line with QUT's expectations for academic transparency in capstone work,
this document declares the development tools used in this project.

## AI-assisted development

Portions of this codebase, particularly the architectural migration documented
in `MIGRATION_AUDIT.md`, `MIGRATION_PLAN.md`, `C2PA_API_NOTES.md`, and the
implementation of the extension-only architecture (commits between `77cb779`
and `d2ccb4b` on the `extension-only-migration` branch), were developed with
the assistance of Anthropic's Claude (Claude Code in VS Code) under the
supervision of [Lucas Mai — n11642556].

**How AI was used:**

- Codebase analysis and migration planning
- Boilerplate generation (esbuild build pipeline, offscreen document scaffold)
- Iterative refactoring of service-worker.js, popup.js, and shared modules
- Documentation drafting

**How AI was NOT used:**

- Architectural decisions (extension-only vs hybrid) were made by team
  members after researching MV3 constraints, the C2PA standard, and the
  c2pa-web SDK behaviour
- All code changes were reviewed before commit
- Industry partner communication conducted directly by team members
- Test asset curation and the "validation_state: Valid not Trusted" UX
  finding were observed and documented by the team

## Other tools

- VS Code (editor)
- esbuild (extension bundler)
- Git + GitHub (version control)
- Adobe Content Credentials web inspector — [contentauthenticity.adobe.com/inspect](https://contentauthenticity.adobe.com/inspect)
  (manifest reference extraction for test assets)
- c2patool — [opensource.contentauthenticity.org/docs/c2patool](https://opensource.contentauthenticity.org/docs/c2patool/)
  (signing workflow for self-signed test assets)
