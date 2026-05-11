// src/main.rs
//
// Entry point. Loads config, builds the Axum router, and starts the server.

mod api;
mod auth;
mod config;
mod error;
mod verify;

use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::AppConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ---------- logging ----------
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("c2pa_service=info,tower_http=info")))
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    // ---------- config ----------
    let cfg = AppConfig::load_or_create()?;

    if cfg.secret_was_generated {
        // Print *once*, prominently, so the developer can copy it into the extension popup.
        let banner = "=".repeat(64);
        println!("\n{banner}");
        println!("[c2pa-service] Generated shared secret (save this in the extension popup):");
        println!("[c2pa-service]   SHARED_SECRET={}", cfg.shared_secret);
        println!("{banner}\n");
    }

    // ---------- router ----------
    let state = api::AppState::new(cfg.clone(), verify::build_default_verifier());
    let app   = api::build_router(state);

    // ---------- bind ----------
    // Binding to 127.0.0.1 is a hard security boundary: external traffic cannot reach us.
    let addr: SocketAddr = format!("127.0.0.1:{}", cfg.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!("Listening on http://{addr}");
    tracing::info!("Health check: curl http://{addr}/api/v1/health");

    axum::serve(listener, app).await?;
    Ok(())
}
