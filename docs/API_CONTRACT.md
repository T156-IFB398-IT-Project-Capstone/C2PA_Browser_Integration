# API Contract — Extension ↔ Rust Service

Version: `v1` (prefix: `/api/v1/`)

## General

- **Base URL:** `http://127.0.0.1:8901` (port configurable via env var `C2PA_SERVICE_PORT`)
- **Binding:** `127.0.0.1` only. External interfaces are not bound.
- **Auth:** every request **must** carry the `X-C2PA-Token` header set to the shared secret.
- **Content-Type:** `application/json; charset=utf-8`.
- **Errors:** JSON body `{ "error": { "code": string, "message": string } }`.

### Error codes

| HTTP | `code`            | Meaning                                             |
| ---- | ----------------- | --------------------------------------------------- |
| 401  | `UNAUTHORIZED`    | Missing or invalid `X-C2PA-Token`.                  |
| 400  | `INVALID_INPUT`   | Malformed request body / unsupported format.        |
| 413  | `PAYLOAD_TOO_LARGE` | Asset exceeds the size limit (default 50 MB).     |
| 429  | `RATE_LIMITED`    | Too many requests from the extension.               |
| 422  | `VERIFY_FAILED`   | Verification ran but asset is invalid/untrusted.    |
| 500  | `INTERNAL`        | Unexpected server error.                            |

## Endpoints

### `GET /api/v1/health`

Liveness probe. Does not require auth (but is localhost-only).

**Response 200:**
```json
{ "status": "ok", "version": "0.1.0" }
```

### `POST /api/v1/verify`

Verify a single media asset.

**Request body:**
```json
{
  "source_url": "https://example.com/image.jpg",
  "media_type": "image/jpeg",
  "data_base64": "<base64-encoded asset bytes>"
}
```

| Field         | Type   | Required | Notes                                                            |
| ------------- | ------ | -------- | ---------------------------------------------------------------- |
| `source_url`  | string | yes      | Original URL. Used for logging/diagnostics only.                 |
| `media_type`  | string | yes      | MIME type. Semester 1: `image/jpeg`, `image/png`.                |
| `data_base64` | string | yes      | Asset bytes. Max 50 MB decoded.                                  |

**Response 200:**
```json
{
  "status": "verified_trusted",
  "source_url": "https://example.com/image.jpg",
  "manifest": {
    "creator": "Sony α9 III",
    "creation_date": "2025-05-12T00:00:00Z",
    "tools_used": ["Adobe Lightroom"],
    "ai_disclosure": false,
    "edits": [],
    "signer": {
      "common_name": "Adobe Inc.",
      "trusted": true
    }
  },
  "timings_ms": {
    "parse": 12,
    "trust_chain": 34,
    "total": 48
  }
}
```

### Status enum (stable)

| Value                          | Meaning                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `verified_trusted`             | Signature valid + signer in local trust list.                  |
| `verified_untrusted`           | Signature valid but signer NOT in local trust list.            |
| `invalid_or_changed`           | Hash mismatch / signature failure.                             |
| `no_credentials`               | No embedded C2PA data found.                                   |
| `unsupported_format`           | Format is not supported in Semester 1.                         |

## Version bumps

Breaking changes ship under a new prefix (`/api/v2/`). The extension negotiates version via the `X-C2PA-Api-Version` request header (defaults to `1`).
