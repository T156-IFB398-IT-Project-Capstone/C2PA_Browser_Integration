# Supported-formats matrix

SPIKE-001 deliverable #2 (`spike-001-mp4-verification.md` §6), completed as
part of closing out the extension-side video verification gap in Sprint 2.
Covers every format the pinned `c2pa-web` build is asked to handle end to end
through the extension pipeline (content-script detection → service-worker
fetch → offscreen WASM verify → popup render), not just the isolated SDK.

| Format | MIME type | Parse (SDK) | Validate (SDK) | Extension pipeline | Caveats |
|---|---|---|---|---|---|
| JPEG | `image/jpeg` | Yes | Yes | Supported, no known gaps | — |
| PNG | `image/png` | Yes | Yes | Supported, no known gaps | — |
| GIF | `image/gif` | Yes | Yes | Supported, no known gaps | — |
| WebP | `image/webp` | Yes | Yes | Supported, no known gaps | — |
| MP4 | `video/mp4` | Yes (SPIKE-001 Q1) | Yes (SPIKE-001 Q2) | Supported — byte-fetch MIME gap fixed on `fix/video-mime-fallback` (2026-08-24) | See below |
| MSE-streamed video (`blob:`) | n/a | n/a | n/a | Out of scope by design | No fetchable URL exists to acquire bytes from; `isVerifiableUrl()` excludes `blob:`/`data:` sources for both video and images (`content-script.js:98`). Not a defect. |

## MP4 caveats

- **Remux survival (SPIKE-001 Q3) — still unknown.** Blocked on a remuxed
  (V3) test fixture requested from Jonah in `test-asset-request.md`; not yet
  delivered.
- **Transcoded/trimmed (V4) and corrupted-manifest (V5) fixtures** — also
  outstanding, requested in the same doc.
- **File size (SPIKE-001 Q4)** — only measured on a 5.3 MB file
  (`sora.MP4`); the ~50 MB target (V6) was never sourced. `MAX_ASSET_BYTES`
  caps verification at 15 MB (`constants.js`), so a realistic large video may
  be rejected before this becomes a verification-correctness question.
- **Expired-certificate status mapping.** A validly-signed MP4 whose signing
  certificate has since expired reports `Invalid or changed` rather than a
  distinct "expired" state, because `determineStatus()`'s Invalid-fallback
  branch fires before its TSA-aware branch for this case. Format-agnostic —
  the same JPEG signed with the same certificate would show identically. See
  `finding-001-expired-signing-certificate.md`.

## How this was verified

- **Fetch-level (chrome-free), automated:** `docs/phase2/video-mime-fallback-evidence/run-mime-fallback-check.mjs`
  run pre-fix and post-fix against `docs/phase2/video-mime-fallback-evidence/mime-fallback-server.mjs`,
  serving real fixtures under varied `Content-Type` conditions (correct /
  missing / generic `application/octet-stream`). Raw output:
  `results-pre-fix.json`, `results-post-fix.json`.
- **Full pipeline, manual:** unpacked extension loaded in real Chrome against
  `docs/phase2/video-mime-fallback-evidence/test-page.html`. Results:
  `sora.MP4` (octet-stream Content-Type) → `Invalid or changed`, AI
  disclosure and signer (`Truepic Lens CLI in Sora`) correctly extracted;
  synthetic no-manifest MP4 → `No Content Credentials`; `car.jpg` regression
  case → `Verified via TSA`, unchanged.
