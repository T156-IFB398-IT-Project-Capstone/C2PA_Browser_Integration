# C2PA API Notes

Step 2 research artifact. Documents the real output shape of `@contentauth/c2pa-web`,
the field gaps between popup.js expectations and what c2pa-web actually returns,
and the VERIFY_STATUS mapping used in offscreen.js.

---

## 1. Node.js Validation Attempt

`scripts/validate-c2pa-api.mjs` was run against `test-assets/trusted/earth_apollo17.jpg`
(the `earth_apollo17.jpg` fixture from the `contentauth/c2pa-rs` GitHub repo, 180 KB).

**Result:** Failed at `createC2pa()` with:
```
Worker is not defined
```

**Root cause:** `@contentauth/c2pa-web` spawns a Web Worker internally via `new Worker(blobUrl)`.
Node.js has no global `Worker` class (it uses `node:worker_threads` instead, with a different API).
The ESM import itself resolves correctly; the failure is at runtime when the SDK tries to boot its
worker thread.

**Conclusion:** c2pa-web is strictly browser-only. All runtime validation must happen in the
extension. See §5 for the fallback procedure.

---

## 2. API Shape (from `@contentauth/c2pa-types` TypeScript definitions)

The types in `node_modules/@contentauth/c2pa-types/dist/types/ManifestStore.d.ts` are
generated directly from the same Rust JSON Schema that drives the WASM binary, so they
are authoritative for the real output shape.

### 2a. `reader.fromBlob(format, blob)` return value

```
Promise<Reader | null>
```

Returns `null` when the asset has **no C2PA manifest**. This is the `NO_CREDENTIALS` case —
not an error. Only throws for genuine failures (corrupt file, unsupported container, WASM panic).

### 2b. `reader.manifestStore()` → `ManifestStore`

```ts
interface ManifestStore {
  active_manifest?:    string | null;           // label key → active entry in .manifests
  manifests?:          { [label: string]: Manifest };
  validation_status?:  ValidationStatus[] | null;
  validation_results?: ValidationResults | null;
  validation_state?:   "Invalid" | "Valid" | "Trusted" | null;
}
```

`active_manifest` is the label string (e.g. `"adobe:urn:uuid:..."`) used to look up the
current manifest in `manifests`. Always call `reader.free()` after reading the store to release
WASM memory.

### 2c. `Manifest` (one entry in `manifests`)

```ts
interface Manifest {
  vendor?:                 string | null;   // e.g. "adobe"
  claim_generator?:        string | null;   // e.g. "Adobe Photoshop/25.0 c2pa-rs/0.28.3"
  claim_generator_info?:   ClaimGeneratorInfo[] | null;
  title?:                  string | null;   // source filename
  format?:                 string | null;   // MIME type, e.g. "image/jpeg"
  instance_id?:            string;
  thumbnail?:              ResourceRef | null;
  ingredients?:            Ingredient[];
  assertions?:             ManifestAssertion[];
  signature_info?:         SignatureInfo | null;
  label?:                  string | null;
  claim_version?:          number | null;
  credentials?:            unknown[] | null;
  redactions?:             string[] | null;
}
```

### 2d. `ClaimGeneratorInfo` (one entry in `claim_generator_info`)

```ts
interface ClaimGeneratorInfo {
  name:              string;         // e.g. "Adobe Photoshop"
  version?:          string | null;  // e.g. "25.0"
  icon?:             UriOrResource | null;
  operating_system?: string | null;
}
```

### 2e. `SignatureInfo`

```ts
interface SignatureInfo {
  alg?:               SigningAlg | null;   // "Es256" | "Es384" | "Ps256" | ...
  issuer?:            string | null;       // e.g. "Adobe"
  common_name?:       string | null;       // e.g. "Adobe Systems Incorporated"
  cert_serial_number?: string | null;
  time?:              string | null;       // ISO 8601 signing timestamp
  revocation_status?: boolean | null;
}
```

### 2f. `ManifestAssertion` (one entry in `assertions`)

```ts
interface ManifestAssertion {
  label:     string;           // reverse-domain label, e.g. "c2pa.actions"
  data:      unknown;          // assertion-specific payload (varies by label)
  instance?: number | null;
  kind?:     "Cbor" | "Json" | "Binary" | "Uri" | null;
}
```

### 2g. `ValidationStatus`

```ts
interface ValidationStatus {
  code:         string;          // e.g. "claimSignature.validated"
  url?:         string | null;
  explanation?: string | null;
  success?:     boolean | null;
}
```

### 2h. Unsigned asset (no manifest)

`reader.fromBlob()` returns `null`. There is no store, no manifests map, no validation_state.
The offscreen document returns `{ status: 'no_credentials', manifest: null, error: null }`.

---

## 3. Field Gap Analysis — popup.js vs c2pa-web

`popup.js renderItem()` (lines 413–415) references three manifest fields that do **not** exist
directly in the c2pa-web output. The `extractManifest()` function in `offscreen.js` bridges
all three gaps. Step 6 will update popup.js to use the real paths and remove the adapters.

| # | popup.js reads | c2pa-web actual path | Exists? | Adapter in offscreen.js |
|---|---|---|---|---|
| 1 | `manifest.creator` | none | **No direct field** | `claim_generator_info[0].name ?? claim_generator` |
| 2 | `manifest.ai_disclosure` | none | **No direct field** | `hasAiAssertion(assertions)` — regex scan |
| 3 | `manifest.signer?.common_name` | `signature_info?.common_name` | **Wrong nesting** | `{ common_name: signature_info.common_name }` |

### Gap 1 — `creator`

The C2PA spec has no `creator` assertion at the top level. The closest field is
`claim_generator_info[0].name` (the tool that produced the manifest, e.g. "Adobe Photoshop")
or the raw `claim_generator` string (user-agent format, e.g. "Adobe Photoshop/25.0 c2pa-rs/0.28.3").

A human author identity, if present, lives inside an `stds.schema-org.CreativeWork` assertion
as `data.author[0].name`. Step 6 should decide whether "creator" means the tool or the author.

### Gap 2 — `ai_disclosure`

No top-level `ai_disclosure` field exists. AI-related information is carried in assertions:

| Assertion label | Meaning |
|---|---|
| `c2pa.ai.generative.training` | AI training preference (allow/prohibit) |
| `c2pa.ai_generative.training` | Older variant of same label |
| `c2pa.training-mining` | Data mining preference |
| `stds.schema-org.CreativeWork` | Contains `digitalSourceType` — check for `"trainedAlgorithmicMedia"` |

The current `hasAiAssertion()` implementation scans `label` strings for `/\bai\b/i` which
catches the first two. Step 6 should extend this to also inspect `stds.schema-org.CreativeWork`
assertion data for `digitalSourceType === "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"`.

### Gap 3 — `signer.common_name`

popup.js reads `item.manifest.signer?.common_name`. c2pa-web returns this under
`signature_info.common_name`. The adapter wraps it as `{ common_name }` to match the
shape popup.js already expects without touching popup.js in this step.

---

## 4. VERIFY_STATUS Mapping

| Condition | c2pa-web signal | VERIFY_STATUS constant | Value |
|---|---|---|---|
| No C2PA manifest | `fromBlob()` returns `null` | `NO_CREDENTIALS` | `"no_credentials"` |
| Valid + trusted CA | `validation_state === "Trusted"` | `VERIFIED_TRUSTED` | `"verified_trusted"` |
| Valid + untrusted signer | `validation_state === "Valid"` | `VERIFIED_UNTRUSTED` | `"verified_untrusted"` |
| Tampered / broken sig | `validation_state === "Invalid"` | `INVALID_OR_CHANGED` | `"invalid_or_changed"` |
| WASM error / panic | `verify()` throws | `"error"` (inline) | `"error"` |
| Unsupported container | `fromBlob()` throws or returns null | `"error"` or `NO_CREDENTIALS` | TBD — monitor in Step 6 |

`"Trusted"` requires the signer's certificate chain to validate against c2pa-web's built-in
trust list (derived from the C2PA trust list anchors). Self-signed manifests will always be
`"Valid"` (not `"Trusted"`) regardless of content integrity.

---

## 5. Browser-Based Validation (Fallback)

Because c2pa-web requires a browser `Worker`, runtime validation of the actual JSON output
shape must happen in the extension itself. Procedure once test images are in place:

1. Build the extension: `npm run build`
2. Load unpacked in MaxBrowser/Chrome: `chrome://extensions` → "Load unpacked" → select `extension/`
3. Temporarily add to `offscreen.js` after `reader.manifestStore()`:
   ```js
   console.log('[c2pa-debug] store:', JSON.stringify(store, null, 2));
   ```
4. Serve a signed image from `test-assets/trusted/` via a local HTTP server and navigate to it,
   or open `scripts/validate-c2pa-browser.html` (not yet created) in the browser
5. Click "Scan this page" in the popup
6. Open the offscreen document DevTools:
   `chrome://extensions` → find the extension → "Inspect views" → select the offscreen document
   (or check the SW console at "service worker")
7. Copy the logged JSON and compare against the type definitions in §2 above
8. Remove the debug log and rebuild before committing

### Test assets

| File | Source | Status |
| --- | --- | --- |
| `test-assets/trusted/earth_apollo17.jpg` | `contentauth/c2pa-rs` fixture — 180 KB | Available |
| `test-assets/trusted/car.jpg` | Adobe Photoshop manifest | Available |
| `test-assets/trusted/ChatGPTgen.png` | ChatGPT/OpenAI manifest | Available |
| `test-assets/untrusted/test_ai_verified.jpg` | Self-signed AI manifest | Available |
| `test-assets/untrusted/test_human_verified.jpg` | Self-signed human manifest | Available |
| `test-assets/no-manifest/cloudmountain.jpg` | Plain JPEG — no C2PA | Available |
| `test-assets/tampered/` | Tampered samples | TODO — see `docs/c2patool-guide.md` |

---

## 6. Open Questions for Step 6

1. **`creator` semantics** — should the popup show the *tool* (`claim_generator_info[0].name`)
   or the *human author* (from `stds.schema-org.CreativeWork` assertion data)?
2. **`ai_disclosure` label** — should the popup show "AI: yes" for *any* AI assertion, or only
   for AI-generated content (digitalSourceType == trainedAlgorithmicMedia)?
3. **`unsupported_format` status** — c2pa-web may throw or return null for unsupported containers
   (e.g. MP4). The service worker should catch this and set status to `UNSUPPORTED_FORMAT`.
   Monitor during Step 4 (SW rewrite).
