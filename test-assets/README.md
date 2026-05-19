# Test Assets

Pack of sample media for end-to-end testing. Matches the test-case matrix from Sprint 1 (Jonah's work).

## Expected contents (add locally)

| File                                   | Case                                           | Expected verifier result     |
| -------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `01-no-manifest.jpg`                   | Plain JPEG, no C2PA                            | `no_credentials`             |
| `02-self-signed-ai.jpg`                | AI-generated with self-signed manifest         | `verified_untrusted`         |
| `03-self-signed-camera.jpg`            | Camera-originated with self-signed manifest    | `verified_untrusted`         |
| `04-adobe-signed-edited.jpg`           | Photoshop-edited, signed by Adobe              | `verified_trusted`           |
| `05-ai-generated-chatgpt.png`          | ChatGPT/DALL·E with provider manifest          | `verified_trusted` or untrusted (depends on trust list) |
| `06-tampered.jpg`                      | Valid manifest + bytes mutated after signing   | `invalid_or_changed`         |

## Sources

- **Content Credentials Verify** — <https://contentcredentials.org/verify>
- **c2pa-rs sample repo** — <https://github.com/contentauth/c2pa-rs/tree/main/sdk/tests/fixtures>
- **Adobe Content Authenticity extension** samples
- Generate tampered cases with `c2patool`:
  ```bash
  c2patool sign input.jpg --manifest manifest.json -o signed.jpg
  # Then flip a few bytes in the pixel data with `dd` or a hex editor.
  ```

## Do not commit

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