# Architecture

This document describes the hybrid architecture of the C2PA Browser Integration system. It reflects the state of the codebase after Sprint 3 and the Sprint 3/4 realtime tracking work.

## Goals

1. Detect C2PA Content Credentials on media rendered in a Chromium-based browser.
2. Verify signatures and trust chains **locally** — no server round trips for verification.
3. Surface provenance in a non-disruptive, non-misleading UI.
4. Stay deliverable inside a student capstone scope.

## Components

### 1. Browser Extension (Chromium MV3)

| Layer | File | Responsibility |
| --- | --- | --- |
| Content Script | `src/content/content-script.js` | DOM scan; `discoverMedia()` for verifiable images; `discoverAllMedia()` for tracking (video/audio/blob); MutationObserver for dynamic content. |
| Service Worker | `src/background/service-worker.js` | Fetch asset bytes; call Rust service via fault-tolerant IPC; manage `TabMediaRegistry`, `ScanQueue`, `ResultCache`; keepalive alarm; health polling. |
| Tab Media Registry | `src/background/tab-media-registry.js` | Per-tab in-memory store of all detected media. Cleared on navigation and tab close. |
| Scan Queue | `src/background/scan-queue.js` | URL-keyed state machine preventing duplicate in-flight verifications. |
| Popup / Side Panel | `src/popup/*` | Two-tab UI: **Scan Results** (on-demand verification) and **Live Media** (realtime tracking). |
| IPC Client | `src/shared/ipc-client.js` | Circuit breaker → AbortController timeout → exponential-backoff retry stack. |
| Result Cache | `src/shared/result-cache.js` | TTL-based (5 min) in-memory verification result cache; evicts oldest 10% when full. |
| Shared Modules | `src/shared/constants.js`, `messages.js` | Tunable constants and typed message-bus contract. |

**Extension constraints** — the extension cannot:

- Access the OS certificate store.
- Run heavy native crypto within the browser memory envelope.
- Support MP4, PDF via `c2pa-js` (requires native Rust SDK).

### 2. Local Rust Service

| Module | Responsibility |
| --- | --- |
| `main.rs` | Entrypoint: loads config, builds router, starts Tokio server. |
| `config.rs` | Loads `.env`/`config.toml`; generates shared secret on first run. |
| `api.rs` | Axum routes: `GET /api/v1/health`, `POST /api/v1/verify`. |
| `auth.rs` | Shared-secret middleware; constant-time comparison; rejects missing/invalid tokens. |
| `verify.rs` | **Verification engine.** `Verifier` trait + `MockVerifier`; `c2pa-rs` integration slot. |
| `error.rs` | `ServiceError` type mapped to structured JSON HTTP responses. |

**Binding:** the service binds **only** to `127.0.0.1`. External traffic is physically impossible.

### 3. IPC

- **Transport:** HTTP over localhost, port 8901 (configurable via `C2PA_SERVICE_PORT`).
- **Auth:** shared secret generated once, stored in `chrome.storage.local`, sent as `X-C2PA-Token`.
- **Format:** JSON, versioned under `/api/v1/`.
- **Fault tolerance:** 10 s AbortController timeout, 3-attempt retry with 400/800 ms exponential backoff, circuit breaker (threshold 3, cooldown 15 s).
- **Contract:** see `API_CONTRACT.md`.

## Pipelines

### Verification pipeline (Scan Results tab)

```text
┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────┐
│ 1. Discovery │──▶│ 2. Fetch     │──▶│ 3. Verify       │──▶│ 4. Trust     │──▶│ 5. UI    │
│ discoverMedia│   │ asset bytes  │   │ (Rust service)  │   │ Chain        │   │ Scan tab │
│ (img only)   │   │ background   │   │ c2pa-rs / mock  │   │ (Rust)       │   │ result   │
└──────────────┘   └──────────────┘   └─────────────────┘   └──────────────┘   └──────────┘
                         ▲ ScanQueue dedup + ResultCache short-circuit ▲
```

Stages 3–4 run in the Rust service. Stages 1–2 and 5 run in the extension.
Up to 3 assets are verified concurrently (`SCAN_CONCURRENCY = 3`).

### Realtime tracking pipeline (Live Media tab)

```text
┌──────────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
│ 1. Discovery         │──▶│ 2. TabMediaRegistry  │──▶│ 3. Popup Live tab  │
│ discoverAllMedia()   │   │ update(tabId, items) │   │ MEDIA_UPDATED push │
│ img + video + audio  │   │ deduplicate by URL   │   │ count badge update │
│ + blob URLs          │   │ clear on navigation  │   │ renderLiveMedia()  │
│ MutationObserver     │   └──────────────────────┘   └────────────────────┘
│ 1 s debounce         │
│ 2 s rate limit       │
└──────────────────────┘
```

The tracking pipeline is intentionally **decoupled from verification**. Tracking shows all media regardless of C2PA support. Verification only runs on user request via the Scan Results tab.

## MV3 Service Worker lifecycle

Chrome terminates idle MV3 Service Workers after ~30 seconds. Two `chrome.alarms` counteract this:

| Alarm | Period | Action |
| --- | --- | --- |
| `c2pa.keepalive` | 24 s | No-op handler; waking the SW is sufficient |
| `c2pa.health_poll` | 30 s | `pollHealth()` → persist to `chrome.storage.session` → broadcast `HEALTH_STATUS_CHANGED` if state changed |

`ensureAlarms()` is idempotent and called at module load, `onInstalled`, `onStartup`, and on every incoming message.

## Threat model

| Threat | Vector | Mitigation |
| --- | --- | --- |
| Manifest tampering | Attacker strips or replaces embedded manifest | Hard-binding hash verification against asset bytes |
| Spoofed provenance | Forged or self-signed certificate | Chain validation against C2PA Trust List |
| IPC hijacking | Malicious process on the host imitates server | Localhost-only bind + shared secret + constant-time comparison |
| UI injection | Page DOM renders fake "verified" badge | Indicators rendered in extension popup, not page DOM |
| Manifest replay | Valid manifest reused on different content | Hard binding ties manifest hash to specific asset bytes |
| IPC flooding | Extension hammers a down service | Circuit breaker opens after 3 failures; 15 s cooldown |

Aligned with ACSC principles: application hardening, privilege restriction, patching.

## Out of scope for Semester 1

- Real `c2pa-rs` integration (slot is ready in `verify.rs`; wiring is Sprint 4)
- Dynamic trust-list updates (Phase 2)
- OCSP / CRL revocation at runtime (Phase 2)
- Soft-binding recovery (Phase 2)
- MP4 and PDF verification (requires native Rust SDK features not yet enabled)
- Video and audio **verification** (tracked and displayed in Live Media panel; verification requires MIME type support in `c2pa-rs` + MockVerifier)
- Native browser integration (considered and rejected — too large for capstone scope)
