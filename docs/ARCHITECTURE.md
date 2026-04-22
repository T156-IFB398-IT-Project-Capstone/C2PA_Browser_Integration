# Architecture

This document summarises the hybrid architecture selected at the end of Sprint 1 and the reasoning behind it. It is the Semester 1 reference for the team and Databench.

## Goals

1. Detect C2PA Content Credentials on media rendered in a Chromium-based browser.
2. Verify signatures and trust chains **locally** — no server round trips for verification.
3. Surface provenance in a non-disruptive, non-misleading UI.
4. Stay deliverable inside a student capstone scope.

## Components

### 1. Browser Extension (Chromium MV3)

| Layer              | File                                | Responsibility                                              |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| Content Script     | `src/content/content-script.js`     | DOM scan for `<img>` elements; filter JPEG/PNG.             |
| Service Worker     | `src/background/service-worker.js`  | Fetch asset bytes; call local service via IPC; cache.       |
| Popup / Side Panel | `src/popup/*`                       | Display verification results + configuration.               |
| Shared Modules     | `src/shared/*`                      | Constants, message types, IPC client.                       |

**Constraints.** The extension cannot:
- Access the OS certificate store.
- Run heavy native crypto in a reasonable memory envelope.
- Support MP4, PDF, WebP via `c2pa-js` today.

### 2. Local Rust Service

| Module           | Responsibility                                               |
| ---------------- | ------------------------------------------------------------ |
| `main.rs`        | Entrypoint. Loads config, builds router, starts Tokio server.|
| `config.rs`      | Loads `.env`/`config.toml`; generates shared secret on first run.|
| `api.rs`         | Axum routes: `/api/v1/health`, `/api/v1/verify`.             |
| `auth.rs`        | Shared-secret middleware; rejects missing/invalid tokens.    |
| `verify.rs`      | **Verification engine.** Currently returns mock results; slot for `c2pa-rs`. |
| `error.rs`       | Structured error type mapped to HTTP responses.              |

**Bindings.** The service binds **only** to `127.0.0.1`. External traffic is physically impossible.

### 3. IPC

- **Transport:** HTTP over localhost.
- **Auth:** shared secret generated once, stored in extension `chrome.storage.local`, sent as `X-C2PA-Token` header.
- **Format:** JSON, versioned under `/api/v1/`.
- **Contract:** see `API_CONTRACT.md`.

## Verification pipeline

```
┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────┐
│ 1. Discovery │──▶│ 2. Manifest  │──▶│ 3. Claim Parse  │──▶│ 4. Trust     │──▶│ 5. UI    │
│ (content     │   │ Extraction   │   │ & Assertion     │   │ Chain        │   │ Present  │
│ script)      │   │ (background) │   │ Validation      │   │ Verification │   │ (popup)  │
│              │   │              │   │ (rust)          │   │ (rust)       │   │          │
└──────────────┘   └──────────────┘   └─────────────────┘   └──────────────┘   └──────────┘
```

Stages 3–4 live in the Rust service. Stages 1–2 and 5 live in the extension.

## Threat model

| Threat                    | Vector                                        | Mitigation                                              |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Manifest tampering        | Attacker strips or replaces embedded manifest | Hard-binding hash verification against asset bytes      |
| Spoofed provenance        | Forged or self-signed certificate             | Chain validation against C2PA Trust List                |
| IPC hijacking             | Malicious process on the host imitates server | Localhost-only bind + shared secret + input validation  |
| UI injection              | Page DOM renders fake "verified" badge        | Indicators rendered in extension popup, not page DOM    |
| Manifest replay           | Valid manifest reused on different content    | Hard binding ties manifest hash to specific asset bytes |

Aligned with ACSC principles: application hardening, privilege restriction, patching.

## Out of scope for Semester 1

- Dynamic trust-list updates (Phase 2)
- OCSP / CRL revocation at runtime (Phase 2)
- Soft-binding recovery (Phase 2)
- Video, PDF, WebP support (Phase 2 via Rust SDK)
- Native browser integration (considered and rejected — too large for capstone)
