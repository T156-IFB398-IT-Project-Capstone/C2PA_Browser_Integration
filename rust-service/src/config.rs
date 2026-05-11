// src/config.rs
//
// Configuration loading. On first run we generate a shared secret and persist it
// to `config.toml` in the working directory. On subsequent runs we reuse it.
//
// Env vars override the file where it makes sense:
//   C2PA_SERVICE_PORT   - TCP port (default 8901)
//   C2PA_SHARED_SECRET  - force a specific secret (useful for CI)

use anyhow::{Context, Result};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DEFAULT_PORT: u16 = 8901;
const CONFIG_FILE: &str = "config.toml";
const SECRET_LEN: usize = 48;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedConfig {
    pub shared_secret: String,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub shared_secret: String,
    /// True only on the run that generated the secret — used for the one-time banner.
    pub secret_was_generated: bool,
}

impl AppConfig {
    pub fn load_or_create() -> Result<Self> {
        let port = std::env::var("C2PA_SERVICE_PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);

        // Highest-priority override: env var.
        if let Ok(secret) = std::env::var("C2PA_SHARED_SECRET") {
            if !secret.is_empty() {
                return Ok(Self {
                    port,
                    shared_secret: secret,
                    secret_was_generated: false,
                });
            }
        }

        let path = config_path();
        if path.exists() {
            let raw = std::fs::read_to_string(&path)
                .with_context(|| format!("reading {}", path.display()))?;
            let persisted: PersistedConfig = toml::from_str(&raw)
                .with_context(|| format!("parsing {}", path.display()))?;
            return Ok(Self {
                port,
                shared_secret: persisted.shared_secret,
                secret_was_generated: false,
            });
        }

        // First run: generate and persist.
        let secret = generate_secret();
        let persisted = PersistedConfig { shared_secret: secret.clone() };
        let serialised = toml::to_string_pretty(&persisted)?;
        std::fs::write(&path, serialised)
            .with_context(|| format!("writing {}", path.display()))?;

        Ok(Self {
            port,
            shared_secret: secret,
            secret_was_generated: true,
        })
    }
}

fn config_path() -> PathBuf {
    PathBuf::from(CONFIG_FILE)
}

fn generate_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(SECRET_LEN)
        .map(char::from)
        .collect()
}
