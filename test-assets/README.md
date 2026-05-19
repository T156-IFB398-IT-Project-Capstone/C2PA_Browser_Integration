# Test Assets

C2PA test images for validating `extension/src/offscreen/offscreen.js` against real signed media.
All images are committed to the repo for team reproducibility. See the size note at the bottom.

---

## Folder layout

| Subfolder | C2PA `validation_state` | `VERIFY_STATUS` | Use case |
| --- | --- | --- | --- |
| `trusted/` | `"Trusted"` | `verified_trusted` | CA chain validates against c2pa-web's built-in trust list |
| `untrusted/` | `"Valid"` | `verified_untrusted` | Signature valid but signer not in trust list |
| `tampered/` | `"Invalid"` | `invalid_or_changed` | TODO — content modified after signing |
| `no-manifest/` | `null` reader | `no_credentials` | Plain image, no C2PA data |
| `docs/` | — | — | Signing guides and reference material |

> **Trust list caveat:** The `trusted/` folder contains files from Adobe and OpenAI tools whose
> signing certificates may or may not be present in c2pa-web's embedded CA trust list.
> Pre-extracted manifest JSONs (alongside each image) show `validation_state: "Valid"` for
> all Adobe/AI files, meaning c2pa-web will classify them as `VERIFIED_UNTRUSTED` with its
> default trust list. The `earth_apollo17.jpg` c2pa-rs fixture may also return `"Valid"`.
> Verify actual runtime states by loading the extension unpacked and running a scan —
> see `docs/c2patool-guide.md`.

---

## File inventory

### `trusted/` — manifests from Adobe, OpenAI, and c2pa-rs

| File | Source / tool | Expected state |
| --- | --- | --- |
| `car.jpg` | Adobe Photoshop — signed by "Adobe C2PA" | `Valid` (Trusted TBD) |
| `cloudscape.jpeg` | Adobe Content Authenticity | `Valid` (Trusted TBD) |
| `crater-lake.jpg` | Adobe Lightroom — signed by "Adobe C2PA" | `Valid` (Trusted TBD) |
| `Firefly-cat.jpg` | Adobe Firefly — signed by "Adobe Firefly C2PA" | `Valid` (Trusted TBD) |
| `ChatGPTgen.png` | ChatGPT (OpenAI) — signed by "Truepic Lens CLI" | `Valid` (Trusted TBD) |
| `sora.MP4` | Sora (OpenAI) — signed by "Truepic Lens CLI in Sora" | `Valid`; video — unsupported format in current extension |
| `earth_apollo17.jpg` | `contentauth/c2pa-rs` test fixture — 180 KB | `Valid` (c2pa-rs self-signed cert) |
| `manifest-car` | Pre-extracted `manifestStore()` JSON for `car.jpg` | — |
| `manifest-cloudscape` | Pre-extracted `manifestStore()` JSON for `cloudscape.jpeg` | — |
| `manifest-crater-lake` | Pre-extracted `manifestStore()` JSON for `crater-lake.jpg` | — |
| `manifest-Firefly-cat` | Pre-extracted `manifestStore()` JSON for `Firefly-cat.jpg` | — |
| `manifest-ChatGPTgen` | Pre-extracted `manifestStore()` JSON for `ChatGPTgen.png` | — |
| `manifest-sora` | Pre-extracted `manifestStore()` JSON for `sora.MP4` | — |

The `manifest-*` files are plain JSON containing the real output of `reader.manifestStore()` as
extracted by the Adobe web inspector. They confirm the API output shape documented in
`C2PA_API_NOTES.md` and can be used as unit-test fixtures without running the WASM.

### `untrusted/` — self-signed manifests

| File | Notes |
| --- | --- |
| `test_ai_verified.jpg` | AI-generated, self-signed C2PA manifest |
| `test_human_verified.jpg` | Human-captured, self-signed C2PA manifest |
| `tamperedpixels.jpeg` | Self-signed manifest; name suggests pixel modification — verify runtime state |

### `no-manifest/` — plain images

| File | Notes |
| --- | --- |
| `cloudmountain.jpg` | Plain JPEG, no C2PA data — `fromBlob()` should return `null` |

### `tampered/` — content modified after signing (TODO)

Placeholder folder. Add tampered samples here for `INVALID_OR_CHANGED` testing.
See `docs/c2patool-guide.md` for how to produce these with `c2patool`.

---

## Adding tampered samples

See `docs/c2patool-guide.md` for the signing workflow and how to flip bytes after signing
to produce a file that triggers `validation_state: "Invalid"`.

---

## Size note

Total: ~11 MB (committed intentionally for team reproducibility).
The bulk is `trusted/sora.MP4` (5.1 MB) and `trusted/ChatGPTgen.png` (2.1 MB).

If this grows past ~20 MB, migrate binaries to Git LFS:

```bash
git lfs track "test-assets/**/*.jpg" "test-assets/**/*.png" "test-assets/**/*.mp4"
```
