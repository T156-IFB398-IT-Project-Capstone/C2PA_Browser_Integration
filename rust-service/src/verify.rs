// src/verify.rs
//
// The Verifier trait is the seam between the HTTP layer and the real
// verification engine. Sprint 2 ships a MockVerifier that returns deterministic
// results so the end-to-end pipeline can be exercised. Sprint 3 will add a
// C2paRsVerifier that wraps the c2pa-rs crate.

use serde_json::{json, Value};
use std::sync::Arc;

// ----------------------------------------------------------------------------
// NOTE: axum's handler bounds require Send + Sync. We don't want to pull in the
// `async_trait` crate for one method, so we expose the trait with a manually
// boxed future. This is standard Rust for small trait objects.
// ----------------------------------------------------------------------------

pub type BoxFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

pub trait Verifier: Send + Sync {
    fn verify<'a>(
        &'a self,
        media_type: &'a str,
        bytes: &'a [u8],
    ) -> BoxFuture<'a, anyhow::Result<VerificationOutcome>>;
}

// ---------- outcome ---------------------------------------------------------

/// Matches the stable status enum in docs/API_CONTRACT.md.
#[derive(Debug, Clone, Copy)]
pub enum VerifyStatus {
    VerifiedTrusted,
    VerifiedUntrusted,
    // Requires real manifest parsing to detect; reserved for Sprint 3+ c2pa-rs integration.
    #[allow(dead_code)]
    InvalidOrChanged,
    NoCredentials,
    UnsupportedFormat,
}

impl VerifyStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::VerifiedTrusted   => "verified_trusted",
            Self::VerifiedUntrusted => "verified_untrusted",
            Self::InvalidOrChanged  => "invalid_or_changed",
            Self::NoCredentials     => "no_credentials",
            Self::UnsupportedFormat => "unsupported_format",
        }
    }
}

pub struct VerificationOutcome {
    pub status:          VerifyStatus,
    pub manifest:        Option<Value>,
    pub trust_chain_ms:  u128,
}

impl VerificationOutcome {
    pub fn status_str(&self) -> &'static str {
        self.status.as_str()
    }
}

// ---------- mock verifier ---------------------------------------------------

/// Deterministic mock. Classifies by the first few bytes of the payload:
///   - JPEG SOI (FF D8 FF): returns verified_trusted with a fake manifest
///   - PNG magic  (89 50 4E 47): returns verified_untrusted
///   - everything else: no_credentials
///
/// This is enough to wire the UI + IPC + caching paths end-to-end.
pub struct MockVerifier;

impl Verifier for MockVerifier {
    fn verify<'a>(
        &'a self,
        media_type: &'a str,
        bytes: &'a [u8],
    ) -> BoxFuture<'a, anyhow::Result<VerificationOutcome>> {
        Box::pin(async move {
            // Simulate trust-chain work so the timing field isn't always zero.
            let trust_chain_start = std::time::Instant::now();
            tokio::time::sleep(std::time::Duration::from_millis(8)).await;
            let trust_chain_ms = trust_chain_start.elapsed().as_millis();

            // Only JPEG and PNG carry C2PA data in the mock; other MIME types are unsupported.
            const SUPPORTED: &[&str] = &["image/jpeg", "image/png", "image/gif", "image/webp"];
            if !SUPPORTED.contains(&media_type) {
                return Ok(VerificationOutcome {
                    status:         VerifyStatus::UnsupportedFormat,
                    manifest:       None,
                    trust_chain_ms: 0,
                });
            }

            let is_jpeg = bytes.len() >= 3 && &bytes[0..3] == b"\xFF\xD8\xFF";
            let is_png  = bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1A\n";

            let (status, manifest) = if is_jpeg {
                (
                    VerifyStatus::VerifiedTrusted,
                    Some(json!({
                        "creator":       "Sony α9 III",
                        "creation_date": "2025-05-12T00:00:00Z",
                        "tools_used":    ["Adobe Lightroom"],
                        "ai_disclosure": false,
                        "edits":         [],
                        "signer": {
                            "common_name": "Adobe Inc.",
                            "trusted":     true
                        },
                        "_mock": true
                    })),
                )
            } else if is_png {
                (
                    VerifyStatus::VerifiedUntrusted,
                    Some(json!({
                        "creator":       "Self-signed camera",
                        "creation_date": "2025-03-01T00:00:00Z",
                        "tools_used":    [],
                        "ai_disclosure": false,
                        "edits":         [],
                        "signer": {
                            "common_name": "unknown self-signed certificate",
                            "trusted":     false
                        },
                        "_mock": true
                    })),
                )
            } else {
                tracing::debug!(%media_type, "no magic bytes recognised → no_credentials");
                (VerifyStatus::NoCredentials, None)
            };

            Ok(VerificationOutcome { status, manifest, trust_chain_ms })
        })
    }
}

// ---------- factory ---------------------------------------------------------

/// Build the verifier the service should ship with.
/// Swap here when the real c2pa-rs implementation lands.
pub fn build_default_verifier() -> Arc<dyn Verifier> {
    Arc::new(MockVerifier)
}
