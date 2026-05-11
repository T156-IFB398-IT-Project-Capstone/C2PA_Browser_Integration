// src/error.rs
//
// One error type for the whole service. Implements IntoResponse so handlers
// can use `?` and get a structured JSON error body without boilerplate.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("payload too large")]
    PayloadTooLarge,

    // Reserved for Sprint 3+ real c2pa-rs verifier — not constructed by the mock.
    #[allow(dead_code)]
    #[error("verification failed: {0}")]
    VerifyFailed(String),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: ErrorPayload<'a>,
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    code: &'a str,
    message: String,
}

impl ServiceError {
    fn parts(&self) -> (StatusCode, &'static str) {
        match self {
            ServiceError::Unauthorized     => (StatusCode::UNAUTHORIZED,         "UNAUTHORIZED"),
            ServiceError::InvalidInput(_)  => (StatusCode::BAD_REQUEST,          "INVALID_INPUT"),
            ServiceError::PayloadTooLarge  => (StatusCode::PAYLOAD_TOO_LARGE,    "PAYLOAD_TOO_LARGE"),
            ServiceError::VerifyFailed(_)  => (StatusCode::UNPROCESSABLE_ENTITY, "VERIFY_FAILED"),
            ServiceError::Internal(_)      => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL"),
        }
    }
}

impl IntoResponse for ServiceError {
    fn into_response(self) -> Response {
        let (status, code) = self.parts();
        let message = self.to_string();

        // Log server-side errors at a louder level than client errors.
        if status.is_server_error() {
            tracing::error!(code, %message, "request failed");
        } else {
            tracing::debug!(code, %message, "request rejected");
        }

        let body = ErrorBody {
            error: ErrorPayload { code, message },
        };
        (status, Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, ServiceError>;
