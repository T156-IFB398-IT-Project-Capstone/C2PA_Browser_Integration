# Test asset request — MP4 fixtures for SPIKE-001

**From:** Lucas (SPIKE-001 — MP4 verification)
**To:** Jonah (hosted test bench)
**Context:** `docs/phase2/spike-001-mp4-verification.md`

SPIKE-001 needs three more MP4 fixtures than currently exist in the repo. We
have V1 (a real signed, untouched MP4 — `test-assets/trusted/sora.MP4`) and V2
(a synthetic no-manifest MP4, hand-built for the negative control). We
deliberately did **not** install `ffmpeg` or `c2patool` to produce V3–V5
ourselves — that's your lane (hosted test bench), and duplicating it locally
would just create a second, divergent asset pool. Producing V3/V4 needs a
remux/transcode tool plus a re-signing step; that's squarely test-bench work.

Definitions below are exactly as specified in the spike doc's asset table
(`docs/phase2/spike-001-mp4-verification.md` §3), spelled out with the extra
detail needed to actually produce them.

## V3 — signed then remuxed

**What:** Take a validly signed MP4 (ideally a fresh one you control, so the
signing certificate is current — see the certificate-expiry note below) and
rewrite its container **without touching the encoded video/audio streams**.
In `ffmpeg` terms, a stream copy: `ffmpeg -i signed.mp4 -c copy remuxed.mp4`
(exact flags are yours to choose — the point is "container rewritten, pixels
untouched," not a specific tool invocation).

**Why it matters:** this is the question a hard-binding scheme lives or dies
on for video. JPEG/PNG hard binding survives most real-world handling because
the file is rarely rewritten byte-for-byte by a CDN. MP4 containers get
remuxed constantly (platform re-packaging, adaptive bitrate prep, mobile
compatibility passes) without touching a single video frame. If a stream-copy
remux invalidates the C2PA manifest, that's a materially different risk
profile from images, and Databench needs to hear it framed that way.

**Expected result:** unknown — that's the point of the test (Q3). Don't
pre-judge it by trying to preserve validity; a remuxed file that fails
validation is exactly as useful a result as one that passes.

## V4 — signed then transcoded or trimmed

**What:** Take a validly signed MP4 and either re-encode it (change codec,
bitrate, or resolution) or trim it (cut the first/last few seconds). Either
counts — pick whichever is easier to produce reliably. Do **not** re-sign
after the transform.

**Why it matters:** confirms the tamper-detection path actually fires for
video the way it does for images (`INVALID_OR_CHANGED`) rather than silently
passing or throwing an unrelated parse error. This is the video equivalent of
the still-empty `test-assets/tampered/` folder for images (see
`KNOWN_LIMITATIONS.md` L5, `repo-baseline-assessment.md` §2) — the team has
never actually exercised the "content was changed after signing" path for
*any* format with a real fixture yet, video or otherwise.

**Expected result:** should fail validation (`validation_state: "Invalid"`,
or equivalent hash-mismatch signal) — worth confirming that MP4's failure
looks like a clean rejection and not a crash or a hang.

## V5 — signed, manifest corrupted

**What:** Take a validly signed MP4 and corrupt bytes specifically **inside
the C2PA manifest/JUMBF box**, leaving the surrounding container and media
bytes untouched. This is different from V4 — V4 breaks the hash binding by
changing the *content*; V5 breaks the *manifest itself* (e.g. flip a few bytes
inside the `uuid`/JUMBF box that carries the C2PA data, or truncate it).

**Why it matters:** feeds Grace's fallback/error-handling work directly. The
open question is whether a corrupted manifest inside an MP4 produces a
graceful, typed error from `c2pa-web` or an unhandled exception / hang. If the
SDK throws something ugly here, that's a result-model and UI-wording
question, not just a video question.

**Expected result:** a graceful, catchable error — no crash. Whatever the
actual error shape turns out to be is exactly what we need on record.

## Also needed: a certificate chain we control

The one real signed MP4 we have (`sora.MP4`) currently validates as `Invalid`
because its **signing certificate has expired** — a third party's (OpenAI's)
certificate, which lapsed mid-project, outside our control and without
warning. Full detail and why this matters beyond this one file:
`docs/phase2/finding-001-expired-signing-certificate.md`.

**Request:** a self-signed certificate chain the team controls, with a long
validity window, for signing our own fixtures going forward. Two benefits:

1. **Expiry becomes a deliberate test case instead of an accident.** With our
   own chain, we can produce a V5-style fixture — signed, then deliberately
   backdated or produced with a short-lived cert — to test the
   `signingCredential.expired` path on purpose, rather than discovering it
   only when a third-party asset happens to lapse.
2. **The corpus stops depending on assets we don't control the lifecycle of.**
   Relying on Adobe/OpenAI-signed samples means the corpus can silently
   degrade (a fixture that validated cleanly last sprint reports `Invalid`
   this sprint, for reasons unrelated to what it's testing) at a time we
   don't choose.

This is also something **Databench's conversion team will need** for their
own testing once the verification core is lifted into the browser settings
feature — worth producing in a form that's documented well enough to hand
over, not just good enough for our own use this sprint.
