# API Contract — Extension ↔ Rust Service

Version: `v1` (prefix: `/api/v1/`)

## General

- **Base URL:** `http://127.0.0.1:8901` (port configurable via env var `C2PA_SERVICE_PORT`)
- **Binding:** `127.0.0.1` only. External interfaces are not bound.
- **Auth:** every request **must** carry the `X-C2PA-Token` header set to the shared secret.
- **Content-Type:** `application/json; charset=utf-8`.
- **Errors:** JSON body `{ "error": { "code": string, "message": string } }`.

### Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | Missing or invalid `X-C2PA-Token`. |
| 400 | `INVALID_INPUT` | Malformed request body or unsupported format. |
| 413 | `PAYLOAD_TOO_LARGE` | Asset exceeds the size limit (default 50 MB). |
| 429 | `RATE_LIMITED` | Too many requests from the extension. |
| 422 | `VERIFY_FAILED` | Verification ran but asset is invalid or untrusted. |
| 500 | `INTERNAL` | Unexpected server error. |

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

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `source_url` | string | yes | Original URL. Used for logging and diagnostics only. |
| `media_type` | string | yes | MIME type. Supported: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. |
| `data_base64` | string | yes | Asset bytes base64-encoded. Maximum 50 MB decoded. |

> **Note:** video and audio MIME types are detected and displayed in the extension's Live Media panel but are not forwarded to this endpoint. Only image MIME types listed above are sent for verification.

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

> Mock responses also include `"_mock": true` in the manifest object to signal that the result is synthetic. This field will not be present when `c2pa-rs` verification is active.

### Status enum (stable)

| Value | Meaning |
| --- | --- |
| `verified_trusted` | Signature valid; signer is in the local trust list. |
| `verified_untrusted` | Signature valid; signer is NOT in the local trust list. |
| `invalid_or_changed` | Hash mismatch or signature failure — asset may have been tampered with. |
| `no_credentials` | No embedded C2PA manifest found in the asset. |
| `unsupported_format` | MIME type or magic bytes are not supported by the current verifier. |

## Extension-side IPC contract

The extension's `ipc-client.js` adds the following reliability guarantees on top of raw HTTP:

- **Timeout:** every request is aborted after 10 seconds (`IPC_TIMEOUT_MS`).
- **Retry:** up to 3 total attempts with exponential backoff (400 ms → 800 ms).
- **Circuit breaker:** opens after 3 consecutive failures; stays open for 15 seconds before a probe is allowed.
- **Error codes surfaced to callers:** `NO_SECRET`, `TIMEOUT`, `CIRCUIT_OPEN`, `HTTP_<status>`.

## Version bumps

Breaking changes ship under a new prefix (`/api/v2/`). The extension negotiates the version via the `X-C2PA-Api-Version` request header (defaults to `1`).
