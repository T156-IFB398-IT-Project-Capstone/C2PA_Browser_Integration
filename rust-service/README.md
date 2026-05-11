# Rust Verification Service

Local HTTP service that performs C2PA verification on behalf of the browser extension. Binds to `127.0.0.1` only and requires a shared-secret token on every verify request.

## Run

```bash
cp .env.example .env    # first run only
cargo run               # dev
cargo run --release     # faster, use for demos
```

On first run the service generates a shared secret and writes it to `config.toml` (git-ignored). The secret is printed once, prominently — copy it into the extension Settings popup.

## Quick health check

```bash
curl http://127.0.0.1:8901/api/v1/health
# {"status":"ok","version":"0.1.0"}
```

## Manual verify request

```bash
# Base64-encode a small JPEG:
B64=$(base64 -i some-image.jpg | tr -d '\n')
SECRET=$(grep shared_secret config.toml | cut -d'"' -f2)

curl -X POST http://127.0.0.1:8901/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "X-C2PA-Token: $SECRET" \
  -d "{\"source_url\":\"test.jpg\",\"media_type\":\"image/jpeg\",\"data_base64\":\"$B64\"}"
```

## Layout

| File         | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| `main.rs`    | Entry: logging, config, bind, serve.                               |
| `config.rs`  | Load/create config with persistent shared secret.                  |
| `api.rs`     | Router, handlers, AppState.                                        |
| `auth.rs`    | Shared-secret middleware (constant-time compare).                  |
| `verify.rs`  | `Verifier` trait + `MockVerifier`. Real `c2pa-rs` slot is here.    |
| `error.rs`   | `ServiceError` → structured JSON error responses.                  |

## Integrating real c2pa-rs (Sprint 3)

1. Uncomment the `c2pa` dependency in `Cargo.toml`.
2. Add `C2paRsVerifier` beside `MockVerifier` in `verify.rs`, implementing the `Verifier` trait.
3. Switch `build_default_verifier()` to return it.

No other files should need to change — that's the point of the trait seam.

## Security notes

- **Localhost only.** `main.rs` binds to `127.0.0.1`. External callers cannot reach us.
- **Shared-secret auth.** Every `/verify` call must carry `X-C2PA-Token`. Comparison is constant-time.
- **Body limit.** 70 MB request cap (≈50 MB decoded asset) via `DefaultBodyLimit`.
- **Input validation.** Empty/invalid base64 rejected before any parser touches the bytes.
- **No file system writes** by the verifier (defensive — `c2pa-rs` has `file_io` feature but we'll gate it).

## Logging

Set `RUST_LOG` to adjust verbosity:

```bash
RUST_LOG=c2pa_service=debug,tower_http=debug cargo run
```
