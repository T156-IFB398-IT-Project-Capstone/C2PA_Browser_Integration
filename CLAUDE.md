# CLAUDE.md — project context for AI agents

This file is read automatically at the start of every session. Treat it as the
working agreement between you (the agent) and the engineer you are assisting.

---

## 1. What this project is

**Project:** P917 — C2PA Content Provenance Integration into a Web Browser
**Client:** Databench Pty Ltd (project owner: Steven Hall, CTO)
**Team:** QUT IFB399 Capstone, Team T156, Semester 2 2026 (Phase 2)
**You are assisting:** Lucas Mai — Technical Lead / Architecture

The product detects C2PA provenance manifests in web media, verifies them
locally, and surfaces the result to the user. Phase 1 delivered a working
proof of concept. Phase 2 hardens it, extends it to video, and prepares it
for handover.

### Architecture as delivered in Phase 1

- Browser extension only. No native host, no server-side verification.
- Verification runs locally through `c2pa-web` (WebAssembly) inside an
  **offscreen document**.
- Content scripts discover media on the page; results flow back through a
  message-passing contract into a **five-state result model**.
- Working end to end on **JPEG and PNG**. Video is unproven.
- Demonstrations run against a **controlled test corpus and a hosted test
  bench**, because most public web media has C2PA metadata stripped.

Exact paths, module names, and versions are **TBC — confirm during baseline
assessment** rather than assuming. Do not guess file locations.

### The Phase 2 pivot (decided 27 July 2026)

Recorded in the project owner meeting minutes:

- The delivered artefact **remains a browser extension**.
- The UI direction is now **very subtle and minimal** — quiet indicators,
  detail on demand, honest wording.
- The product end-state is C2PA verification **built into the browser** as an
  ON/OFF option in browser settings. **Databench's own developers will convert
  our extension into that feature.**
- Therefore the handover must be **conversion-ready**, not merely working.

---

## 2. Hard constraints

These are decisions already made. Do not relitigate them; raise a flag if you
believe one is wrong, then wait.

1. **The verification core must not depend on `chrome.*` APIs.** The verifier,
   result model, cache, and scan queue must be reachable and testable outside
   the extension. Any browser-specific access goes through a named adapter
   interface. This is the single most important architectural rule in Phase 2 —
   it is what makes the handover convertible.
2. **`c2pa-web` is version-pinned.** It is pre-1.0 with breaking changes between
   releases. Never upgrade it as a side effect of another task. An upgrade is a
   deliberate, separately reviewed change.
3. **Verification is local.** No outbound network request may be introduced
   without an explicit decision recorded in `docs/phase2/decisions/`. This
   includes trust list fetching and any per-certificate revocation check
   (OCSP/CRL). Databench's positioning is privacy and security for its users.
4. **No traffic-light semantics.** C2PA proves provenance, not truthfulness. A
   green tick overclaims. Status wording must stay neutral and honest, and the
   absence of credentials must never be presented as evidence of falsity.
5. **Never add a dependency without asking.** State what it does, its licence,
   its size, and what it replaces.
6. **Scope discipline.** Stretch work never displaces the critical path.
7. **Never run process-wide, machine-wide, or recursive destructive commands.**
   This includes killing all instances of a process by image name, recursive
   deletes outside the working tree, global package installs, and git clean.
   Scope every command to a specific PID, path, or branch. If a task appears
   to require a broad command, stop and ask.

---

## 3. Ownership — do not work outside this lane

| Area | Owner | Agent may touch? |
|---|---|---|
| Verifier core, offscreen document, video workstream, performance harness, architecture, conversion-readiness | **Lucas** | Yes |
| Minimal UI, popup, content-script rendering, ON/OFF control | Brian | No — read only |
| Trust model, TSA certificate checking, trust-list design, hosted test bench | Jonah | No — read only |
| Result model contract, regression suite, fallback/error handling | Grace | Coordinate first — the contract is shared |
| Sprint plan, risk register, partner documentation | Zach | No |

If a task requires changing a file another member owns, stop and say so. Do not
silently edit across the boundary.

---

## 4. How to work

### Evidence before assertion

Never report that something works. Report the command you ran and what it
printed. If you cannot produce a reproducible command, the claim is not made.
This project is assessed on evidence shown at meetings; unverifiable claims are
worse than no claim.

### Branching and commits

- One branch per work item: `spike/mp4-verification`, `feat/…`, `docs/…`.
- Never commit to the main branch.
- Never merge. Lucas reviews and merges.
- Commit messages describe the change and its purpose in plain English.
- If a commit contains AI-assisted code, note it in the commit body:
  `AI-assisted: <what the agent produced> — reviewed by LM`

### GenAI transparency (assessment requirement — not optional)

The unit requires each student to demonstrate authorship of their own work and
to explain their use of AI tools when asked. At the end of every working
session, append an entry to `docs/genai-log/YYYY-MM.md`:

```
## <date> — <branch>
Task:            <what was asked>
Agent produced:  <files touched, roughly what was generated>
Human review:    <what Lucas changed, rejected, or verified>
Verification:    <command run + result>
```

Keep it short and truthful. Its purpose is that Lucas can explain any line of
this codebase to a tutor without preparation.

### Working rhythm

1. Read before writing. State what you found.
2. Propose a plan. Wait for approval on anything beyond a trivial edit.
3. Make the smallest change that answers the question.
4. Verify. Show the output.
5. Log.

### Definition of done (from the Phase 2 sprint plan)

Code works on the selected path, is **demoable by another team member**, has at
least minimal documentation, and carries a note on conversion impact where
relevant.

---

## 5. Current sprint

**Sprint 1 — Weeks 2–3 (27 July – 9 August 2026)**
Objective: re-establish delivery rhythm after the break, absorb the pivot, and
retire the largest technical unknown — video verification — as early as
possible.

Lucas's items this sprint:

| Item | Status | Doc |
|---|---|---|
| MP4 verification spike | Not started | `docs/phase2/spike-001-mp4-verification.md` |
| Supported-formats matrix | Not started | output of the spike |
| Post-break re-baseline (build, load, regression) | In progress | with Grace |
| Performance harness design (for Sprints 3–4) | Not started | — |
| Conversion-readiness notes / seam map | Not started | — |

The spike is the critical path: its outcome determines whether Sprint 2 builds
video verification or re-scopes it to detection-plus-documented-limitation.

---

## 6. Vocabulary

- **Manifest** — the C2PA provenance record attached to an asset.
- **Assertion** — a claim inside a manifest (creator, edits, AI tool use).
- **Hard binding** — cryptographic binding of the manifest to the exact bytes.
- **Soft binding** — recovery via perceptual features; survives re-encoding.
- **TSA** — time-stamping authority; proves *when* something was signed.
- **Trust list** — the set of certificate issuers we treat as trusted.
- **Conversion-ready** — the handover state where Databench's developers can
  lift the verification core into a browser settings feature without
  untangling extension-specific concerns.
- **Test bench** — the team's hosted corpus of signed, unsigned, expired, and
  tampered assets with known expected outcomes.
