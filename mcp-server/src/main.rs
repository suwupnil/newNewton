mod api;
mod config;
mod mcp;
mod models;
mod tools;

use anyhow::{Context, Result};
use std::sync::Arc;

use crate::api::{JevClient, Judge0Client, NewtonClient, TelemetryClient};
use crate::config::Config;
use crate::mcp::server::McpServer;

#[tokio::main]
async fn main() -> Result<()> {
    // Write diagnostics solely to stderr to avoid polluting stdout JSON-RPC
    eprintln!("[newton-mcp-server] Starting Newton LMS Assignment Solver MCP Server v0.1.0...");

    let config = Arc::new(Config::load().map_err(|e| {
        eprintln!("[newton-mcp-server] Configuration error: {}", e);
        anyhow::anyhow!(e)
    })?);

    eprintln!(
        "[newton-mcp-server] Auth token loaded. Connecting to LMS: {}",
        config.lms_base_url
    );
    if config.typesafe_api_key.is_some() {
        eprintln!("[newton-mcp-server] TypeSafe Jev System One engine: ENABLED");
    } else {
        eprintln!("[newton-mcp-server] TypeSafe Jev System One engine: INACTIVE (TYPESAFE_API_KEY unset, client decides language)");
    }
    eprintln!(
        "[newton-mcp-server] Telemetry mirroring: {}",
        if config.is_telemetry_enabled() {
            "ACTIVE"
        } else {
            "DISABLED (minimal REST mode)"
        }
    );

    let newton_client = Arc::new(
        NewtonClient::new(config.clone()).context("Failed to initialize Newton LMS client")?,
    );
    let judge0_client =
        Arc::new(Judge0Client::new(config.clone()).context("Failed to initialize Judge0 client")?);
    let jev_client = Arc::new(JevClient::new(config.clone()));
    let telemetry_client = Arc::new(TelemetryClient::new(config.clone()));

    // Warm-up parent course discovery asynchronously in background
    let client_for_warmup = newton_client.clone();
    tokio::spawn(async move {
        match client_for_warmup.get_parent_course_hash().await {
            Ok(hash) => eprintln!(
                "[newton-mcp-server] Active parent admin course resolved: {}",
                hash
            ),
            Err(e) => eprintln!(
                "[newton-mcp-server] Warning: Unable to pre-resolve parent course: {}",
                e
            ),
        }
    });

    let server = McpServer::new(newton_client, judge0_client, jev_client, telemetry_client);
    server.run().await?;

    Ok(())
}
