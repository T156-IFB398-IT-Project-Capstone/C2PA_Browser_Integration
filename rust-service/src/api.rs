// src/api.rs
//
// Axum router and request handlers.
//
//   GET  /api/v1/health   — unauthenticated liveness probe
//   POST /api/v1/verify   — authenticated verification endpoint
//
// The verifier implementation is injected via AppState so tests (and future
// real c2pa-rs wiring) can swap it out without touching the router.

use axum::{
    extract::{DefaultBodyLimit, State},
    middleware,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::auth::require_shared_secret;
use crate::config::AppConfig;
use crate::error::{Result, ServiceError};
use crate::verify::Verifier;

const MAX_BODY_BYTES: usize = 70 * 1024 * 1024;  // 70 MB request cap (includes base64 overhead)
const MAX_ASSET_BYTES: usize = 50 * 1024 * 1024; // 50 MB decoded asset cap
const SERVICE_VERSION: &str = env!("CARGO_PKG_VERSION");

// ------------- shared state -------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    pub config:   Arc<AppConfig>,
    pub verifier: Arc<dyn Verifier>,
}

impl AppState {
    pub fn new(config: AppConfig, verifier: Arc<dyn Verifier>) -> Self {
        Self {
            config: Arc::new(config),
            verifier,
        }
    }
}

// ------------- router -------------------------------------------------------

pub fn build_router(state: AppState) -> Router {
    // CORS is permissive here because the real access gates are:
    //   (a) the service binds to 127.0.0.1 only, and
    //   (b) every write endpoint requires the shared secret.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any);

    // Protected routes: the auth middleware runs before the handler and will
    // short-circuit with 401 if the shared secret is missing/invalid.
    let protected = Router::new()
        .route("/verify", post(verify_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_shared_secret,
        ));

    let public = Router::new().route("/health", get(health_handler));

    Router::new()
        .nest("/api/v1", public.merge(protected))
        .fallback(fallback_handler)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

// ------------- health -------------------------------------------------------

#[derive(Serialize)]
struct HealthResponse {
    status:  &'static str,
    version: &'static str,
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status:  "ok",
        version: SERVICE_VERSION,
    })
}

// ------------- verify -------------------------------------------------------

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub source_url:  String,
    pub media_type:  String,
    pub data_base64: String,
}

async fn verify_handler(
    State(state): State<AppState>,
    Json(body):   Json<VerifyRequest>,
) -> Result<Json<serde_json::Value>> {
    let started = Instant::now();

    // ---- input validation ----
    if body.source_url.is_empty() {
        return Err(ServiceError::InvalidInput("source_url is required".into()));
    }
    if body.media_type.is_empty() {
        return Err(ServiceError::InvalidInput("media_type is required".into()));
    }
    if body.data_base64.is_empty() {
        return Err(ServiceError::InvalidInput("data_base64 is required".into()));
    }

    // Cheap upper-bound check before decoding: base64 is ~4/3 of the byte length.
    if body.data_base64.len() > MAX_ASSET_BYTES * 2 {
        return Err(ServiceError::PayloadTooLarge);
    }

    let bytes = BASE64
        .decode(&body.data_base64)
        .map_err(|e| ServiceError::InvalidInput(format!("data_base64 is not valid base64: {e}")))?;

    if bytes.len() > MAX_ASSET_BYTES {
        return Err(ServiceError::PayloadTooLarge);
    }

    tracing::info!(
        media_type = %body.media_type,
        size       = bytes.len(),
        source     = %body.source_url,
        "verify request"
    );

    // ---- delegate to the verifier ----
    let parse_start = Instant::now();
    let outcome = state
        .verifier
        .verify(&body.media_type, &bytes)
        .await
        .map_err(ServiceError::Internal)?;
    let parse_ms = parse_start.elapsed().as_millis();

    // ---- shape response (JSON schema matches docs/API_CONTRACT.md) ----
    let payload = serde_json::json!({
        "status":     outcome.status_str(),
        "source_url": body.source_url,
        "manifest":   outcome.manifest,
        "timings_ms": {
            "parse":       parse_ms,
            "trust_chain": outcome.trust_chain_ms,
            "total":       started.elapsed().as_millis(),
        }
    });

    Ok(Json(payload))
}

// ------------- fallback -----------------------------------------------------

async fn fallback_handler() -> Result<Json<serde_json::Value>> {
    Err(ServiceError::InvalidInput("unknown route".into()))
}
