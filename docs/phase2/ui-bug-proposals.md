# UI bug proposals (out of lane)

Proposals for files owned by other team members (CLAUDE.md §3). **Nothing
here has been edited.** Each entry states file, line, expected vs actual, and
how it was found, so the owner can decide.

All of these came from **reading the code**. None has been confirmed by an
automated test yet, because the E2E suite is waiting on the Playwright
dependency decision. [`ui-test-checklist.md`](ui-test-checklist.md) has the
manual steps that confirm or refute each one.

Line numbers are as of `main` @ `d2920f0`.

---

## P1 — Popup reads `manifest.validity`, which nothing produces

- **Owner:** Brian (popup)
- **File:** `extension/src/popup/popup.js:369-379`
- **Actual:** `renderItem()` reads `item.manifest.validity.certificate_status`
  and `.timestamp_status`. The offscreen verifier never emits a `validity`
  key. It emits `validity_window: { inside_validity, expired }`
  (`offscreen.js:222-225`) and `tsa_info: { validated, … }`. So
  `certificate: expired`, `certificate: untrusted` and `timestamp: untrusted`
  never render.
- **Expected:** those hints appear when they apply, for example
  `validity_window.expired` → `certificate: expired`, and `tsa_info` present
  but not validated → `timestamp: untrusted`. Alternatively, remove the dead
  branch.
- **Checklist:** case 5, last item.

## P2 — Test-bench Shield images 404 under `npm run dev`

- **Owner:** Jonah (test bench). A fix could equally sit in `scripts/dev.mjs`
  (Lucas), so agree which side changes first.
- **File:** `c2pa-test-bench/app.js:257`
- **Actual:** the bench loads Shield SVGs from
  `../extension/src/popup/badges/<file>`. Served at
  `http://127.0.0.1:8976/`, the browser resolves that to
  `/extension/src/popup/badges/<file>`. `scripts/dev.mjs` serves only
  `c2pa-test-bench/` and rejects paths outside it, so the request becomes
  `c2pa-test-bench/extension/src/popup/badges/<file>`, which does not exist.
  The result is a 404 and a broken image. It works only when the repo root is
  served.
- **Expected:** Shield images render on the local bench. Options: dev.mjs
  serves a read-only alias for `/extension/src/popup/badges/`, or the bench
  build copies the four SVGs next to `index.html`.
- **Checklist:** case 2, optional bench run.

## P3 — Only the first `<img>` with a given URL gets a badge

- **Owner:** Brian (content script)
- **File:** `extension/src/content/content-script.js:378-394`
  (`findImageForUrl`), called once per result at `:289`
- **Actual:** discovery de-duplicates by URL, so a page showing the same image
  twice (a thumbnail and a hero, say) yields one result. `findImageForUrl`
  then returns the first matching `<img>` only, so the second copy is never
  badged.
- **Expected:** every `<img>` whose URL matches a badged result gets the badge.
- **Checklist:** not covered directly. The fixture page deliberately gives
  every image a distinct URL (`?case=…`) so this does not mask the other
  checks.

## P4 — Badge wrapper can change layout on the host page

- **Owner:** Brian (content script)
- **File:** `extension/src/content/content-script.js:640-661`
  (`addCornerBadge` wrapper)
- **Suspected (unconfirmed):** the wrapper is an `inline-block` span with
  non-`!important` inline styles. Three cases look likely to shift layout:
  - **Floated images:** the float is now contained inside the inline-block,
    so text no longer wraps round it.
  - **Percentage-width images:** `width: 100%` resolves against a
    shrink-to-fit wrapper instead of the original container.
  - **Host rules:** `span { … !important }` rules override the wrapper, and
    child-combinator rules such as `.gallery > img` stop matching.
- **Expected:** adding a badge moves nothing by more than about 1 px.
- **Checklist:** case 4, which measures fixture sections A–F.

## P5 — Open wording question: "Authentic" / "Fully verified"

- **Owner:** Brian (wording), with the trust model from Jonah
- **Files:** `extension/src/content/content-script.js:430-466`,
  `extension/src/shared/badge-map.js:30-31`
- **Not a bug, a question for the team.** Hard constraint #4 says C2PA proves
  provenance, not truthfulness. The badge key and label "Authentic" and the
  headline "Fully verified" may read as a claim about the image rather than
  about its credential. Consider wording that names the credential, for
  example "Content Credentials verified".

---

## Not a proposal: popup and in-page badge disagree (ChatGPTgen.png)

The root cause is in the offscreen verifier (Lucas's lane), not the UI.
`offscreen.js:199` (`classifyContentFromActions`, which feeds the in-page
badge) and `offscreen.js:201` (`analyzeActions`, which feeds the popup Shield)
are two separate classifiers. They also read different inputs: the first
walks the ingredient tree (`collectActionsDeep`), while the second reads only
the active manifest's `m.assertions`. That is a likely source of the
disagreement, though it is unconfirmed. This is tracked as the
detector-unification work item (WI-2). Checklist case 9 records the disagreement until then.
