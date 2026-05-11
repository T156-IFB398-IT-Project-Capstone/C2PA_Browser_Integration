// src/auth.rs
//
// Shared-secret middleware.
//
// Every request to /api/v1/verify must carry X-C2PA-Token set to the shared
// secret. Comparison is constant-time to avoid timing side-channels.

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};

use crate::api::AppState;
use crate::error::ServiceError;

pub const TOKEN_HEADER: &str = "X-C2PA-Token";

pub async fn require_shared_secret(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, ServiceError> {
    let provided = req
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !constant_time_eq(provided.as_bytes(), state.config.shared_secret.as_bytes()) {
        return Err(ServiceError::Unauthorized);
    }
    Ok(next.run(req).await)
}

/// Constant-time byte comparison. Avoids a fast-path early return on length
/// mismatch to reduce timing-side-channel leakage.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        let mut sink: u8 = 0;
        for &byte in a {
            sink |= byte;
        }
        std::hint::black_box(sink);
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
