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

Keep the `private/` subfolder for anything with user data — `.gitignore` already excludes it.

## Validated assets

### test-signed.jpg
- **Source:** c2pa.org public test files (`adobe-20220124-C.jpg`)
- **Maps to:** Case `04` — Adobe-signed edited image
- **Validated by:** Grace (n11907142) — byte-level scanner, 11 May 2026

Byte-level scan confirmed the following markers present:

| Marker | Position | Meaning |
|---|---|---|
| `c2pa` | byte 27116 | C2PA manifest signature |
| `jumb` | byte 50340 | JUMBF container format |
| `cred` | byte 61332 | Content credentials |

**Extension test result:** `VERIFIED — Signed by Adobe Inc.`

**How to reproduce:**
```bash
node test-assets/read-c2pa.mjs
```

Expected output:

✅ Found: C2PA manifest at byte 27116
✅ Found: JUMBF container at byte 50340
✅ Found: Content credentials at byte 61332
✅ THIS IMAGE CONTAINS C2PA DATA!
Signer: Adobe Inc.

**Browser extension test:**
Serve locally and load in Chrome:
```bash
npx http-server test-assets/ -p 8080
```
Then open `http://localhost:8080` and run the extension — expect `VERIFIED` result.
