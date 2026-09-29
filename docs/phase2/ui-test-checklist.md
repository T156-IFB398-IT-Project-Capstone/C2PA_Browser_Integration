# Manual UI test checklist

**Status:** fallback. Automated end-to-end UI tests (Playwright) are proposed
but not installed: `@playwright/test` would be a new devDependency, and
CLAUDE.md hard constraint #5 needs an explicit decision before one is added.
Until that decision is made, run this checklist before merging any change to
the popup, content script, detail page, badge assets, or the result shape the
UI reads.

The ten cases below match the planned automated cases one for one, so this
file becomes the spec for `tests/e2e/` if Playwright is approved.

It takes about 15 minutes. Record results in the PR description using the run
record template at the end.

Known bugs that make some checks fail today are listed in
[`ui-bug-proposals.md`](ui-bug-proposals.md). A check that fails *only* for a
listed reason is recorded as "known (P#)", not as a regression.

---

## Setup

1. Build the extension from the commit under test:

   ```bash
   npm ci
   npm run build
   ```

2. Serve the **repo root** on loopback only. The fixture page reaches up into
   `test-assets/`, so serving a subfolder breaks its image paths.

   ```bash
   python -m http.server 8080 --bind 127.0.0.1
   ```

   Any static server works if it binds to `127.0.0.1` and serves the repo
   root. Do not use `npx http-server`: it downloads a package. Stop the server
   with Ctrl-C when you are done, because it exposes the whole working tree
   (including `.git/`) to this machine.

3. Use a Chrome profile with no other extensions. Open `chrome://extensions`,
   turn on Developer mode, click **Load unpacked** and select `extension/`.
   If an earlier build is already loaded, click its reload ↻ button instead.

   If your Chrome is managed (on some machines Chrome 152's policy blocks
   unpacked extensions), use a Chromium build or another profile that allows
   it. Write down which one you used.

4. Open the fixture page:
   <http://127.0.0.1:8080/docs/phase2/ui-test-fixtures/ui-checklist.html>

**Which tab the popup scans.** The popup always acts on the *active tab of the
current window* (`chrome.tabs.query({ active: true, currentWindow: true })` in
`service-worker.js`). Always open it from the toolbar icon while the fixture
tab is in front. Opening `popup.html` in its own tab makes that tab the
"active tab", so the scan targets the popup page itself.

Badges only appear after a scan. Nothing scans automatically, and reloading
the page removes all badges.

---

## 1. Extension loads

- [ ] The extension card at `chrome://extensions` has **no "Errors" button**.
- [ ] Under *Inspect views* there is a **service worker** link. Clicking it
      opens DevTools with no red errors in the Console.

## 2. Badges appear on the right images, and only those

Take the layout baseline from case 4 **before** this scan. Then, with the
fixture tab in front, open the popup, click **Scan this page**, and wait until
the popup lists results.

- [ ] Write down the popup status for `test-signed.jpg?case=A` (for example
      "Signed — provider not in trust list"). Sections A–F depend on it.
- [ ] Every image in A–F has a 28 px corner badge at its bottom-right.
      These are all the same file, so their badges should all be the same.
      *If A–F show no badge at all, the status above is one that `pickBadge`
      does not badge (no credentials, unsupported format, error). The
      layout check in case 4 then proves nothing, so record it and stop.*
- [ ] **G**, **E2** and every **S** image have no badge. In DevTools →
      Elements, none of them has a `span[data-c2pa-badge-wrapper]` parent.
- [ ] Right-click a badge → Inspect. The badge is
      `img[data-c2pa-badge-icon]`, its `alt` is `C2PA status: <key>`, and its
      `src` loads (no broken-image icon).
- [ ] The popup's **Scan Results** list does not contain the badge icons
      themselves (`chrome-extension://…/icons/badges/…`).

Optional, for wider status coverage: run `npm run dev`, open the test bench at
<http://127.0.0.1:8976> and scan it from the popup. `no-credentials.jpg` should
get no badge. Assets whose status is `verified_tsa`, `verified_untrusted`,
`signing_expired`, `content_tampered`, `broken_signature` or
`invalid_or_changed` should get the neutral "unverifiable" badge. The bench's
*own* Shield images are known to 404 under `npm run dev` (P2); that does not
affect the extension's badges.

## 3. Tooltip, modal, and wording

On any badged image:

- [ ] Hovering the badge shows a dark tooltip with a headline, a body, and a
      **More detail** button. Moving the pointer from the badge onto the
      tooltip keeps it open. Moving off both hides it.
- [ ] **More detail** opens a centred modal whose title is the filename and a
      table of facts: *Trust status*, plus *Signed by*, *Issuer*, *Signed at*,
      *Timestamp*, *Content history* and *Content category* where present.
- [ ] The modal closes with ×, and also by clicking the dark backdrop outside
      it. Clicking inside the modal does **not** close it.
- [ ] **Neutral wording (hard constraint #4).** No tooltip, modal, popup or
      detail text says *fake*, *real*, *true*, *false*, *safe*, *unsafe*,
      *genuine*, *trustworthy* or *manipulated*. Nothing presents the lack of
      credentials as evidence against an image, and no status uses a green/red
      traffic-light colour pair to suggest a verdict.

## 4. Layout does not shift when a badge is added

This is the main regression risk. `addCornerBadge()` wraps each badged `<img>`
in an inline-block `span[data-c2pa-badge-wrapper]`.

1. After loading the page and **before** scanning, open DevTools on the
   fixture tab. Make sure the Console's context dropdown shows **top**, then
   run the [layout snippet](#layout-snippet). It stores a baseline.
2. Scan from the popup and wait for the badges.
3. Run the same snippet again. It prints a table of `dx`/`dy`/`dw`/`dh` for
   every `[data-case]` element and flags anything that moved more than 1 px.

- [ ] Every badged image (`*-img`) keeps its position and size (no `SHIFT`).
- [ ] Every probe (`*-probe`) stays where it was: the text after an inline
      image (A), the paragraph wrapping round the float (B), and the text
      under the object-fit box (C), the fluid box (D) and the gallery (E).
- [ ] **C** still crops (`object-fit: cover`) instead of stretching.
- [ ] **E**: both gallery images keep the same 140×100 size. A badged image
      that stops matching `.gallery > img` shows up here.
- [ ] **F** (the host page sets `span { display:block !important }`): record
      what happens. The wrapper's inline styles are not `!important`, so a
      shift here is expected today (P4).
- [ ] **G** (control) never moves. If it does, the measurement is unreliable,
      so re-run it.

Record the whole table in the run record, not just pass/fail.

## 5. Popup renders correctly

After the scan in case 2, in the popup:

- [ ] The meta line reads `N items on 127.0.0.1:8080 — scanned at <time>`,
      and every scanned image has a card with a thumbnail, URL, kind tag and
      status label.
- [ ] A **Shield badge** is drawn on a card only when its status is one of
      *Verified — trusted*, *Verified via TSA*, *Signed — provider not in
      trust list* or *Expired (No TSA)*. Cards for *No Content Credentials*,
      *Content tampered*, *Broken signature*, *Invalid or changed*, *Format not
      supported* and *Error* show the text label only.
- [ ] Close and reopen the popup. The last scan is restored without
      re-scanning.
- [ ] **Live Media** tab: the count badge matches the number of listed items.
      Items show kind tags, and clicking one scrolls the page to that element
      and flashes a blue outline.
- [ ] Known today (P1): the grey meta line under a card never shows
      `certificate: expired`, `certificate: untrusted` or
      `timestamp: untrusted`, even for results where that applies.

## 6. Detail tab

- [ ] Clicking a result card (or focusing it and pressing Enter) opens a new
      tab titled `C2PA Result Detail — <url>`.
- [ ] It shows the media with the same Shield (or none) as the card, plus
      these rows: *Status* (`<label> (<status>)`), *Author / creator*,
      *Signer / common name*, *Signer issuer*, *AI disclosure*,
      *TSA timestamp*, *TSA validated*, *Validity window* (when present) and
      *Error* (when present).
- [ ] The raw manifest JSON is shown, or `// No C2PA manifest present` for an
      image without one.

## 7. No errors in any console

Check all five places after running cases 2–6:

| Where | How to open it |
| --- | --- |
| Service worker | `chrome://extensions` → *Inspect views: service worker* |
| Offscreen document | `chrome://extensions` → *Inspect views: offscreen.html* (listed only while it is alive, right after a scan) |
| Popup | Right-click inside the popup → Inspect |
| Detail tab | DevTools on that tab |
| Content script | DevTools on the fixture tab → Console, context dropdown → **C2PA Content Credentials (QUT x Databench)** |

- [ ] No `Uncaught …` exception and no `console.error` line in any of them.
- [ ] The extension card still has no "Errors" button.

Allowlist (these are *not* failures):

- `Failed to load resource … /favicon.ico 404` in the fixture tab. The page
  has no favicon; this is the page, not the extension.
- `console.warn` / `console.debug` lines prefixed `[C2PA …]`. These are
  intentional diagnostics (for example `scroll-to-media: no matching
  element`), and they log at warn or debug level, not error.

Anything else at error level is a failure. Copy it into the run record.

## 8. Badge selection from SYNTHETIC results

> **SYNTHETIC — not a real trusted asset.** No real `verified_trusted`
> fixture exists yet; Databench is supplying them after handoff. This step
> sends hand-written results straight to the content script so you can check
> its badge-selection rules on its own. It proves nothing about verification,
> and the message never goes through the verifier.

Run the [synthetic snippet](#synthetic-snippet) in the **service worker**
console (see case 7 for how to open it), with the fixture page open. Then check
section S:

| Image | Synthetic status | Synthetic `contentCategory` | Expected badge (alt `C2PA status: …`) | Expected tooltip headline |
| --- | --- | --- | --- | --- |
| S1 | `verified_trusted` | `authentic` | `authentic` | Fully verified |
| S2 | `verified_trusted` | `edited` | `edited` | Fully verified — edited |
| S3 | `verified_trusted` | `ai_edited` | `ai_edited` | Fully verified — AI-edited |
| S4 | `content_tampered` | `ai_generated` | `ai_generated` (bypasses the trust gate) | Discloses AI generation |
| S5 | `verified_untrusted` | `authentic` | `unverifiable` (gate holds) | Can't confirm the signer |
| S6 | `verified_trusted` | *(none)* | `unverifiable` | Can't confirm the signer |
| S7 | `no_credentials` | *(no manifest)* | **none** | — |
| S8 | `error` | *(no manifest)* | **none** | — |
| S9 | `unsupported_format` | *(no manifest)* | **none** | — |

- [ ] All nine rows match the table.
- [ ] S4's tooltip body says its signing credential isn't fully verified.
      It must not read as fully verified.
- [ ] S5's modal lists *Content category: Authentic (not shown as a badge —
      requires a fully trusted signature first)*.
- [ ] Every synthetic tooltip and modal shows the signer as
      `SYNTHETIC — not a real trusted asset`, so no screenshot of this step can
      be mistaken for a real result.

## 9. Popup and in-page badge agree (ChatGPTgen.png)

Section H of the fixture page, after the case 2 scan:

- [ ] Write down the popup card's Shield `alt` (Authentic / Authentic — Edited
      / AI-Edited / AI-Generated / none) and the in-page badge `alt`.
- [ ] They describe the same thing.

**Expected to fail today.** The popup Shield comes from
`manifest.ai_source_type` / `has_non_ai_edit` (`analyzeActions`, `badge-map.js`).
The in-page badge comes from `manifest.contentCategory`
(`classifyContentFromActions`). These are two separate classifiers in
`offscreen.js` (lines 199 and 201), so they can disagree. The fix is the
detector-unification work item (WI-2) in the offscreen verifier. Record the
two values; this becomes a real regression only if they change without that
work landing.

## 10. Visual comparison

No screenshot baselines are committed. Screenshots taken on different machines
differ in fonts and anti-aliasing, so a committed baseline would only produce
noise.

- [ ] Attach two screenshots to the PR: the popup after the case 2 scan, and
      the fixture page sections A–F with badges. Take them at 100% zoom with
      a 1280 px-wide window.
- [ ] Compare them by eye against the screenshots attached to the last PR
      that ran this checklist. Note any difference that is not explained by
      the change under test.

---

## Snippets

### Layout snippet

Paste into the **fixture tab's** DevTools console (context **top**). The first
run stores a baseline; the second run compares against it. Reload the page to
start over.

```js
(() => {
  const now = {};
  for (const el of document.querySelectorAll('[data-case]')) {
    const r = el.getBoundingClientRect();
    now[el.dataset.case] = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }
  if (!window.__c2paBefore) {
    window.__c2paBefore = now;
    return 'Baseline stored. Scan from the popup, wait for badges, then run this again.';
  }
  const TOL = 1; // px
  const rows = Object.entries(now).map(([k, a]) => {
    const b = window.__c2paBefore[k];
    const [dx, dy, dw, dh] = ['x', 'y', 'w', 'h'].map((p) => Math.round((a[p] - b[p]) * 10) / 10);
    const el = document.querySelector(`[data-case="${k}"]`);
    return {
      case: k, dx, dy, dw, dh,
      wrapped: !!el.parentElement?.closest('[data-c2pa-badge-wrapper]'),
      SHIFT: [dx, dy, dw, dh].some((v) => Math.abs(v) > TOL) ? 'YES' : '',
    };
  });
  console.table(rows);
  return `${rows.filter((r) => r.SHIFT).length} element(s) moved more than ${TOL}px`;
})();
```

### Synthetic snippet

Paste into the **service worker** console. It sends one message to the
fixture tab's content script only.

```js
// SYNTHETIC — not a real trusted asset. Hand-written scan results, sent
// straight to the fixture tab's content script to exercise badge selection.
(async () => {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url?.includes('/ui-test-fixtures/ui-checklist.html'));
  if (!tab) return 'Open the fixture page first.';
  const base = new URL('/test-assets/no-manifest/cloudmountain.jpg', tab.url).href + '?synthetic=';
  const signer = { common_name: 'SYNTHETIC — not a real trusted asset' };
  const row = (n, status, manifest) => ({ sourceUrl: base + n, status, manifest });
  const results = [
    row(1, 'verified_trusted',   { contentCategory: 'authentic',    signer }),
    row(2, 'verified_trusted',   { contentCategory: 'edited',       signer }),
    row(3, 'verified_trusted',   { contentCategory: 'ai_edited',    signer }),
    row(4, 'content_tampered',   { contentCategory: 'ai_generated', signer }),
    row(5, 'verified_untrusted', { contentCategory: 'authentic',    signer }),
    row(6, 'verified_trusted',   { signer }),
    row(7, 'no_credentials',     null),
    row(8, 'error',              null),
    row(9, 'unsupported_format', null),
  ];
  await chrome.tabs.sendMessage(tab.id, {
    type: 'c2pa/scan_complete',
    payload: { summary: { results } },
    ts: Date.now(),
  });
  return `Sent ${results.length} SYNTHETIC results to tab ${tab.id}.`;
})();
```

---

## Run record (paste into the PR)

```text
UI checklist run
Commit:        <sha>
Browser:       <Chrome/Chromium + version>, profile: <clean / other>
Tester:        <name>   Date: <yyyy-mm-dd>
test-signed.jpg status in popup: <label>

 1 Extension loads ............ pass / FAIL
 2 Badges ..................... pass / FAIL
 3 Tooltip / modal / wording .. pass / FAIL
 4 Layout ..................... pass / FAIL / known (P4)   <paste table>
 5 Popup ...................... pass / FAIL / known (P1)
 6 Detail tab ................. pass / FAIL
 7 Consoles ................... pass / FAIL   <paste any errors>
 8 Synthetic badge selection .. pass / FAIL
 9 Popup vs in-page agreement . agree / disagree (known, WI-2)  popup=<alt> page=<alt>
10 Screenshots ................ attached / differences: <...>
```
