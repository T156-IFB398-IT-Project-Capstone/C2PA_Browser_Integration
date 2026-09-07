# SPIKE-001 — MP4 verification with c2pa-web

**Owner:** Lucas Mai (Technical Lead)
**Sprint:** 1 (Weeks 2–3, 27 July – 9 August 2026)
**Timebox:** 3 working days. Stop at the timebox and report whatever is known.
**Status:** Not started
**Risk addressed:** R1 — video verification may not work as expected

---

## 1. Why this exists

Phase 2 extends the product from images to video. Everything the team knows
about C2PA verification comes from JPEG and PNG, where the manifest sits in a
metadata segment the SDK reads directly. **MP4 is a different container with
different embedding rules, and image behaviour cannot be assumed to carry
over.**

This spike exists to make that unknown cheap. It is not the beginning of the
video feature — it is the decision that determines whether the video feature
gets built at all.

**The spike succeeds when the outcome is documented with evidence, whichever
way it falls.** "We proved it does not work, here is the trace" is a complete
and valuable result. Do not treat a negative outcome as failure, and do not
spend time trying to force a positive one.

---

## 2. Questions to answer, in order

Answer each before moving to the next. Stop early if an answer makes the
remaining questions moot.

| # | Question | Why it matters |
|---|---|---|
| Q1 | Does `c2pa-web` **parse** a manifest embedded in an MP4 at all? | If not, video is detection-only at best. Everything downstream stops. |
| Q2 | Does it **validate** the signature chain on that manifest? | Parsing without validation means we can show "credentials present" but not "verified" — a materially weaker product claim. |
| Q3 | Does the hard binding survive a **remux** (container rewritten, pixels untouched)? | Determines whether ordinary CDN and platform processing destroys verification in practice. |
| Q4 | What is the **memory and time cost** on a realistic file? | An offscreen document has limits. A 50 MB video that hangs the browser is not shippable. |
| Q5 | Does the existing **result model** represent a video result without change? | Feeds Grace's contract work; a needed change must be flagged now, not in Sprint 2. |

---

## 3. Test assets

Build the smallest corpus that answers the questions. Coordinate with Jonah —
he owns the hosted test bench and is adding video cases this sprint. Prefer
extending his bench over creating a parallel private corpus.

| ID | Asset | Expected result | Purpose |
|---|---|---|---|
| V1 | MP4, validly signed, untouched | Verified | Q1, Q2 — the happy path |
| V2 | MP4, no manifest | No credentials | Baseline; confirms detection is not producing false positives |
| V3 | MP4, signed then remuxed (container rewritten, stream copied) | Unknown — this is the finding | Q3 |
| V4 | MP4, signed then transcoded or trimmed | Should fail validation | Confirms tamper detection actually fires |
| V5 | MP4, manifest present but corrupted | Graceful error, no crash | Error handling; feeds Grace's fallback work |
| V6 | Large MP4 (target ~50 MB), validly signed | Verified, with figures | Q4 |

If signed MP4 assets cannot be sourced, record that as a finding in its own
right and say what was tried. Sourcing difficulty is itself a project risk.

---

## 4. Method

1. **Isolate.** Drive `c2pa-web` directly in a minimal harness — not through the
   full extension. The extension adds message passing, offscreen document
   lifecycle, and content-script discovery, any of which could mask or mimic an
   SDK failure. A failure inside the extension is ambiguous; a failure in the
   harness is a fact about the SDK.
2. **Pin the version.** Record the exact `c2pa-web` version under test in the
   findings. The result is only meaningful against a stated version.
3. **One asset at a time.** Record the raw SDK output per asset — the actual
   returned object or error, not a summary of it.
4. **Instrument before optimising.** For Q4, measure wall-clock time and peak
   memory. Do not tune anything; the number is the deliverable.
5. **Do not fix what you find.** If parsing is broken, document it. Fixing is a
   Sprint 2 decision that depends on this spike's outcome.

---

## 5. Decision tree

The outcome maps to exactly one of three Sprint 2 shapes. Record which one, and
the evidence for it.

```
Q1: manifest parsed?
├─ no  → OUTCOME C: detection-only
│         Sprint 2 scopes video to "credentials present, not verifiable here",
│         documented as a known limitation. Agree the reduced scope with
│         Databench before the artefact agreement is drafted.
└─ yes → Q2: signature validated?
         ├─ no  → OUTCOME B: partial
         │         Sprint 2 surfaces an honest intermediate state. Requires a
         │         result-model change (coordinate with Grace) and a wording
         │         decision (coordinate with Brian).
         └─ yes → OUTCOME A: full support
                   Sprint 2 builds MP4 verification through the existing
                   pipeline. Q3 and Q4 findings shape the scan strategy —
                   in particular whether video is scanned eagerly or only on
                   user request.
```

Q3 and Q4 do not change the outcome letter but they change the Sprint 2 plan:
a hard binding that dies on remux, or a 40-second verification, is a product
constraint Steven needs to hear about at the next partner meeting.

---

## 6. Deliverables

1. **Findings** — section 7 below, completed.
2. **Supported-formats matrix** — a table of format × parse × validate ×
   caveats, covering JPEG, PNG, and MP4. This becomes part of the handover
   documentation. **Completed:** [`supported-formats-matrix.md`](./supported-formats-matrix.md)
   (Sprint 2, alongside the extension-side video verification gap fix).
3. **A recommendation** — one paragraph naming the outcome letter and what
   Sprint 2 should do.
4. **Risk register update** — R1 moves to Closed, or its treatment changes.

---

## 7. Findings

*Fill in as the spike runs. Leave the structure even where the answer is
"unknown" — a stated gap is more useful than a silent one.*

**Environment**

- `c2pa-web` version: 0.7.0 exact (`node_modules/@contentauth/c2pa-web/package.json`), transitively `@contentauth/c2pa-wasm@0.5.0`, which embeds `c2pa-rs 0.76.1` compiled into the WASM binary (confirmed via embedded source-path strings in `c2pa_bg.wasm` — see the pre-harness capability check below).
- Browser and version: Google Chrome 150.0.7871.187 (Windows), both headless and headed, for the plain-page run. See §"Run 2" below for why the offscreen-document run did not complete.
- Date run: 2026-08-03.
- Harness: isolated, not the extension. Two files (`plain-harness.html`/`.js`), served over `http://127.0.0.1:8973` by a throwaway Node static server (built-ins only, no new dependency), driving a real Chrome instance via the Chrome DevTools Protocol HTTP endpoint (`/json/new`) — no message passing, no offscreen document, no content-script discovery. `c2pa-web/inline` was imported directly and bundled with the project's existing `esbuild` (no new dependency) because the raw npm dist ships an unresolved bare specifier (`import ... from "highgain"`) that a browser's native ES module loader cannot resolve without a bundler — this is itself a finding, see below.
- Test assets: **V1** = `test-assets/trusted/sora.MP4` (real, OpenAI-signed, unmodified). **V2** = a hand-synthesized 148-byte ISO-BMFF file (`ftyp`+`moov[mvhd]`+`mdat` boxes, no C2PA data) — not ffmpeg/c2patool output, per instruction not to install either.

**Methodology note — the MIME trap actually fired, this is not hypothetical**

The plan (§4, method item 3, and a follow-up instruction before running) called
for varying the MIME string per case specifically because a wrong string
produces a failure indistinguishable from "format unsupported." That risk was
not theoretical: the harness's own static file server, on its first working
version, served `sora.MP4` (uppercase extension on disk) as
`application/octet-stream` because its Content-Type lookup table used a
lower-cased `.mp4` key. Calling `c2pa.reader.fromBlob('application/octet-stream', blob)`
on that same, real, validly-signed file **threw `UnsupportedFormatError`**.
Had only that one "natural" path been run, the correct write-up would have
been "c2pa-web cannot handle this MP4" — false, and consequential: per the
decision tree (§5), a false Q1 "no" would have routed straight to Outcome C
and scoped video down to detection-only, on the strength of a bug in a
five-line test-server helper, not a finding about the SDK. Running the same
file with an explicit `video/mp4` and `application/mp4` in the same pass is
what caught it. This is recorded as a standing methodology point for any
future spike touching format-dependent SDK behaviour: **never trust a single
MIME source; log every candidate string against every result.**

**Pre-harness capability check (does this exact build even carry BMFF support?)**

Before writing any harness code, the pinned build was inspected directly (package exports, bundled JS, and the compiled WASM binary's embedded strings — see full detail already reported earlier in this session). Key raw evidence, extracted from `node_modules/@contentauth/c2pa-wasm/pkg/c2pa_bg.wasm`:

```
".../c2pa-0.76.1/src/asset_handlers/bmff_io.rs"
".../c2pa-0.76.1/src/assertions/bmff_hash.rs"
"struct BmffHash with 6 elements"
"assertion.bmffHash.match" "assertion.bmffHash.malformed" "assertion.bmffHash.mismatch" "BMFF hash valid"
"invalid BMFF structure: expected box type \"ftyp\" at offset 4, found "
```

This confirmed BMFF/MP4 hard-binding support is compiled into the pinned engine as a core module (not an optional/feature-gated add-on we could see evidence of), and — notably — the validation status code strings baked into the binary (`assertion.bmffHash.match`) are the exact same vocabulary already present in `test-assets/trusted/manifest-sora`, our independent oracle. This did not answer Q1 by itself; it made a "no" outcome from the harness unlikely but not guaranteed, since format dispatch and JS↔WASM plumbing were still unverified. Feature-flag configuration itself was **not inspectable** — npm ships only the compiled `dist/`/`pkg/` artifacts, no `Cargo.toml`, no documented opt-in flags for any of the three `@contentauth` packages. Recorded as its own finding below (relevant to R2).

**Q1 — parsing**

- **Result: YES.** `c2pa-web` 0.7.0 parses the C2PA manifest embedded in `sora.MP4` and returns the full `ManifestStore`, including the BMFF hard-binding assertion (`c2pa.hash.bmff.v3`), when called with an explicit `video/mp4` MIME string. Confirmed with a negative control (V2, a real MP4-shaped file with no manifest) returning `null` rather than a false positive — see full case-by-case evidence below.
- **A real false-negative was caught, exactly as anticipated.** The "natural" `blob.type` for `sora.MP4` fetched through the harness's own static server came back as `application/octet-stream`, **not** `video/mp4` — because the naive server's Content-Type lookup used a lower-cased `.mp4` map key against the file's actual (uppercase) `.MP4` extension on disk, and missed. Calling `fromBlob('application/octet-stream', blob)` on that same, valid, real file threw `UnsupportedFormatError: Unsupported format: application/octet-stream.` Had this been the only case run, the correct conclusion would have been the wrong one — an SDK failure that is actually a MIME-string bug. This is exactly the trap flagged before running: MIME must be varied and recorded, not incidental.
- **Limitation stated explicitly, not implied:** this result generalises from **one file, one signer (OpenAI/Sora), one encoder path**. No inference is drawn about MP4 support in general beyond "the pinned SDK can parse and act on at least this one real BMFF hard-binding structure."
- Evidence (raw, per case — MIME string, exact SDK return, all four cases run against V1, plus the V2 negative control):

*Case 1 — V1, `mimeUsed: 'video/mp4'` (explicit)*
```json
{
  "outcome": "reader-ok",
  "manifestStore": {
    "active_manifest": "urn:c2pa:bcf81c7f-d40f-4f4b-8e2e-4ad2b62dd90a",
    "manifests": {
      "urn:c2pa:bcf81c7f-d40f-4f4b-8e2e-4ad2b62dd90a": {
        "claim_generator_info": [{ "name": "Sora", "org.contentauth.c2pa_rs": "0.67.1" }],
        "title": "d90caade1479466cad555c2d67c8f1dd_media.mp4",
        "instance_id": "xmp:iid:5f02b825-8aa4-455b-8e29-5d0bd2bdaf33",
        "assertions": [
          {
            "label": "c2pa.actions.v2",
            "data": { "actions": [{ "action": "c2pa.created", "softwareAgent": { "name": "Sora" }, "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }] },
            "created": true
          },
          {
            "label": "c2pa.hash.bmff.v3",
            "data": {
              "exclusions": [
                { "xpath": "/uuid", "data": [{ "offset": 8, "value": [216,254,195,214,27,14,72,60,146,151,88,40,135,126,196,129] }] },
                { "xpath": "/ftyp" },
                { "xpath": "/mfra" }
              ],
              "alg": "sha256",
              "hash": [98,83,118,146,247,145,82,57,4,121,128,154,78,34,245,107,248,219,12,176,121,226,68,133,201,65,211,1,249,140,213,82],
              "name": "jumbf manifest"
            },
            "created": true
          }
        ],
        "signature_info": { "alg": "Es256", "issuer": "OpenAI", "common_name": "Truepic Lens CLI in Sora", "cert_serial_number": "617499572571975960762842960741769199804397700166", "time": "2025-10-10T03:06:10+00:00" },
        "label": "urn:c2pa:bcf81c7f-d40f-4f4b-8e2e-4ad2b62dd90a",
        "claim_version": 2
      }
    },
    "validation_status": [
      { "code": "signingCredential.expired", "url": "self#jumbf=/c2pa/urn:c2pa:bcf81c7f-d40f-4f4b-8e2e-4ad2b62dd90a/c2pa.signature", "explanation": "certificate expired" },
      { "code": "signingCredential.untrusted", "url": "self#jumbf=/c2pa/urn:c2pa:bcf81c7f-d40f-4f4b-8e2e-4ad2b62dd90a/c2pa.signature", "explanation": "signing certificate untrusted" }
    ],
    "validation_results": {
      "activeManifest": {
        "success": [
          { "code": "timeStamp.validated", "explanation": "timestamp message digest matched: DigiCert SHA256 RSA4096 Timestamp Responder 2025 1" },
          { "code": "claimSignature.insideValidity", "explanation": "claim signature valid" },
          { "code": "claimSignature.validated", "explanation": "claim signature valid" },
          { "code": "assertion.hashedURI.match", "explanation": "hashed uri matched: self#jumbf=c2pa.assertions/c2pa.actions.v2" },
          { "code": "assertion.hashedURI.match", "explanation": "hashed uri matched: self#jumbf=c2pa.assertions/c2pa.hash.bmff.v3" },
          { "code": "assertion.bmffHash.match", "explanation": "BMFF hash valid" }
        ],
        "informational": [
          { "code": "timeStamp.untrusted", "explanation": "timestamp cert untrusted: DigiCert SHA256 RSA4096 Timestamp Responder 2025 1" }
        ],
        "failure": [
          { "code": "signingCredential.expired", "explanation": "certificate expired" },
          { "code": "signingCredential.untrusted", "explanation": "signing certificate untrusted" }
        ]
      }
    },
    "validation_state": "Invalid"
  }
}
```

*Case 2 — V1, `mimeUsed: 'application/octet-stream'` (the "natural" `blob.type`, per the harness server's Content-Type bug described above)*
```json
{
  "outcome": "threw",
  "error": {
    "name": "UnsupportedFormatError",
    "message": "Unsupported format: application/octet-stream.",
    "stack": "UnsupportedFormatError: Unsupported format: application/octet-stream.\n    at Object.fromBlob (plain-harness.bundle.js:295:15)\n    at runCase (plain-harness.bundle.js:520:38)\n    at main (plain-harness.bundle.js:569:11)"
  }
}
```

*Case 3 — V1, `mimeUsed: 'application/mp4'` (explicit fallback)* — identical `manifestStore` to Case 1, `outcome: "reader-ok"`, same `validation_state: "Invalid"`, same full success/failure lists. Confirms Case 1 wasn't a fluke of that specific MIME string.

*Case 4 — V2 (synthetic, no-manifest MP4), `mimeUsed: 'video/mp4'`*
```json
{
  "outcome": "reader-null",
  "manifestStore": null
}
```

**Field-by-field comparison against the independent oracle** (`test-assets/trusted/manifest-sora`, captured previously by Adobe's web inspector — a different tool, same file):

| Field | Oracle (`manifest-sora`) | Harness (this run, 2026-08-03) | Match? |
|---|---|---|---|
| `validation_state` | `"Valid"` | `"Invalid"` | **No** — see Q2 below |
| `claimSignature.validated` | present in `success`, "claim signature valid" | present in `success`, "claim signature valid" | **Yes** |
| `assertion.bmffHash.match` | present in `success`, "BMFF hash valid" | present in `success`, "BMFF hash valid" | **Yes** |
| `validation_status` (failure reasons) | one entry: `signingCredential.untrusted` | two entries: `signingCredential.expired` **and** `signingCredential.untrusted` | **No** — extra `expired` entry |

**Q2 — validation**

- **Result: YES.** The BMFF hard-binding validation path works and agrees with
  the independent oracle on every check that bears on it:
  `claimSignature.validated` succeeds, `claimSignature.insideValidity`
  succeeds, `assertion.bmffHash.match` succeeds — identical to the oracle in
  code and explanation text. The signature is cryptographically valid and the
  hash binding is intact.
- The one place this run's `validation_state` (`Invalid`) diverges from the
  oracle's (`Valid`) is an additional `signingCredential.expired` failure —
  **this is a separate, cross-cutting finding, not a Q2 result.** It is
  format-agnostic (would occur identically on a JPEG signed with the same
  certificate) and is written up on its own in
  [`docs/phase2/finding-001-expired-signing-certificate.md`](./finding-001-expired-signing-certificate.md)
  rather than folded into this answer.
- Evidence: see the `validation_status` / `validation_results` blocks in Case 1/Case 3 above, and the oracle excerpt in `test-assets/trusted/manifest-sora`.

**Q3 — remux survival**

- Result: **blocked.** Requires a stream-copy-remuxed signed MP4, which we
  deliberately did not produce ourselves (no `ffmpeg`/`c2patool` installed,
  per team decision — that tooling belongs to the hosted test bench, not a
  local spike harness). Requested from Jonah as V3 in
  `docs/phase2/test-asset-request.md`. No finding until that asset exists.
- Evidence: —

**Q4 — cost**

Measured on the only asset available (`sora.MP4`, 5.3 MB) — not the ~50 MB
target in the original asset table (V6, also not sourced), but a real figure
on a real file. Isolated plain-page harness, same context as Q1/Q2 (no
extension, no offscreen document). Three independent runs, consistent to
within a few ms; figures below are from the third (fully clean-server) run.

| Stage | Time |
|---|---|
| `createC2pa()` (cold WASM init) | 71.1 ms |
| fetch V1 over localhost (5,278,370 bytes) | 28.3 ms — **not representative of a real network fetch**, same-machine loopback only |
| `reader.fromBlob('video/mp4', blob)` | 250.6 ms |
| `reader.manifestStore()` | 1.8 ms |
| `reader.free()` | 0.7 ms |
| **Verify-only (fromBlob + manifestStore), excludes cold SDK init and fetch** | **255.6 ms** |
| **Total, cold start through result (init + fetch + verify)** | **360.7 ms** |

Memory — two different numbers, deliberately not merged into one:

- **JS heap (`performance.memory`, Chrome-only, page-attributable):** 21.5 MB
  baseline → 37.3 MB after `createC2pa()` (**+15.7 MB for SDK/WASM-glue init**),
  then flat (+14 KB) for the actual `fromBlob`/`manifestStore`/`free`
  sequence on this file. This number does **not** include WASM linear memory,
  which Chrome tracks outside the JS heap — it understates the true footprint
  of the WASM engine itself.
- **OS-level total working set** across the whole Chrome process tree for
  this run (browser + GPU + network utility + renderer + crashpad-handler,
  fresh empty profile): **442–486 MB across three runs.** This is mostly
  Chrome/OS baseline for a multi-process browser with an empty profile, not a
  figure attributable to `c2pa-web` specifically — it is included because the
  offscreen-document budget question (per the spike's own Q4 rationale) is
  ultimately about total process cost, not isolated library cost. Each run's
  reading is effectively a single sample (the whole operation completes in
  ~360 ms, faster than reliable sub-100 ms polling via `Get-CimInstance` in
  this environment), so treat this as a same-ballpark snapshot, not a
  rigorously sampled peak curve.
- **Not measured:** steady-state/warm cost of a second verification in the
  same page (no cold SDK init) — would better estimate per-file cost during a
  scan of multiple videos. Flagged as a gap, not filled here.

**Q5 — result model fit**

- Not evaluated in depth this pass — out of scope for what was asked this
  round (Q1/Q2 answer + Q4 measurement). One relevant data point surfaced
  incidentally: the Sora manifest carries a real AI-disclosure assertion —
  `c2pa.actions.v2` with `digitalSourceType:
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"`
  (see Case 1 raw output above) — which is exactly the shape
  `offscreen.js`'s existing `hasAiAssertion()` already checks for on images.
  Flagged for Grace as a real, concrete example to test the AI-disclosure
  field against, for video specifically.
- Changes required: not assessed.
- Coordinated with Grace on: not yet — flagging the AI-disclosure example
  above is the extent of contact so far.

**Run 2 (offscreen document) — outstanding, handed to Lucas**

Not completed by the automated harness. `plain-harness` (Run 1, above) drove
`c2pa-web` directly with no extension involved. A second harness was built to
drive the real, unmodified `offscreen.js` via its actual
`chrome.runtime.sendMessage(VERIFY_REQUEST)` contract, loaded into a real
built extension (`--load-extension`) — but every attempt to navigate directly
to an extension page (including the shipped, untouched `offscreen.html`, not
just the new harness pages) failed with `chrome-error://chromewebdata/` and
`Content verify job failed... reason:1`, in both headless and headed Chrome.
`chrome://extensions` in that automated session showed "Your browser is
managed by your organisation" with an empty extension list — evidence
pointing at an interaction between this machine's Chrome policy and
command-line/CDP-driven unpacked-extension loading specifically, not a
`c2pa-web` finding. Lucas is loading the extension manually to finish this
leg rather than have the agent work around browser policy.

**This distinction matters for how Run 2's result gets read once it lands:**
if the plain-page path (Q1/Q2, above) succeeds and the offscreen-document
path fails or differs, that is **not** a new Q1 answer — Q1 is already
answered, on the SDK itself, in isolation. A failure specific to the
offscreen document would instead be a **conversion-readiness finding**: it
would mean something about the offscreen document's execution context (CSP,
lifecycle, Worker handling) breaks a code path that demonstrably works
outside it — directly relevant to Hard Constraint #1 and Section 3 of the
baseline assessment, not to whether `c2pa-web` can handle MP4.

**Outcome: A — full support.**

`c2pa-web` 0.7.0 both parses (Q1) and validates (Q2) the C2PA manifest
embedded in a real, signed MP4, confirmed against a real file with a real
independent oracle for comparison. `assertion.bmffHash.match` agrees with the
oracle; `claimSignature.validated` and `claimSignature.insideValidity` both
succeed. The BMFF hard-binding verification path works. The one point of
disagreement with the oracle (`validation_state: Invalid` vs `Valid`) is
attributable entirely to a signing certificate that has expired since the
oracle capture — a format-agnostic, cross-cutting issue, not a Q1/Q2 result,
written up separately in `finding-001-expired-signing-certificate.md` per
instruction rather than folded into this outcome.

**Recommendation for Sprint 2:**

Build MP4 verification through the existing pipeline (per the Outcome A
branch of the decision tree, §5) — the BMFF path is real and works on at
least one real asset. Three things should shape *how* it's built, not
*whether*: (1) `Q3` (remux survival) is still genuinely unknown and blocks any
claim about durability under real-world CDN/platform processing — treat MP4
verification as provisional until Jonah's V3 fixture lands and Q3 is run; (2)
Q4's ~360 ms cold-start-to-result figure (on a 5.3 MB file, single sample)
suggests eager on-page-load scanning of every video is not free the way a
small JPEG is — worth deciding scan-on-demand vs eager once a larger file
(V6, ~50 MB) is available; (3) Run 2 (offscreen-document context) is still
open and could turn into a conversion-readiness finding independent of this
outcome — don't treat Outcome A as "ready to ship" until that leg reports
back.

**Open questions for the partner:**

- Whether "hash-bound and signature-valid, but the signer's certificate has
  since expired" should be communicated differently from "tampered" in the
  product's status wording — raised in
  `finding-001-expired-signing-certificate.md`, not answered there. This is a
  policy/positioning question for Steven as much as an engineering one, per
  Hard Constraint #4 (no traffic-light semantics, absence-of-credentials must
  never read as evidence of falsity — expired-but-otherwise-valid sits in
  similar territory).
