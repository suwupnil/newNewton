use anyhow::Result;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::api::{JevClient, Judge0Client, NewtonClient, SupabaseClient, TelemetryClient};
use crate::mcp::protocol::{JsonRpcRequest, JsonRpcResponse};
use crate::tools;

pub struct McpServer {
    newton_client: Arc<NewtonClient>,
    judge0_client: Arc<Judge0Client>,
    jev_client: Arc<JevClient>,
    telemetry_client: Arc<TelemetryClient>,
    supabase_client: Arc<SupabaseClient>,
}

impl McpServer {
    pub fn new(
        newton_client: Arc<NewtonClient>,
        judge0_client: Arc<Judge0Client>,
        jev_client: Arc<JevClient>,
        telemetry_client: Arc<TelemetryClient>,
        supabase_client: Arc<SupabaseClient>,
    ) -> Self {
        Self {
            newton_client,
            judge0_client,
            jev_client,
            telemetry_client,
            supabase_client,
        }
    }

    pub async fn run(&self) -> Result<()> {
        let stdin = tokio::io::stdin();
        let mut reader = BufReader::new(stdin).lines();
        let mut stdout = tokio::io::stdout();

        eprintln!("[newton-mcp-server] Server listening on standard I/O (JSON-RPC 2.0)");

        let mut buffer = String::new();

        while let Some(line) = reader.next_line().await? {
            let trimmed = line.trim();
            if trimmed.is_empty() && buffer.is_empty() {
                continue;
            }

            // Handle optional Content-Length: header if passed
            if trimmed.to_ascii_lowercase().starts_with("content-length:") {
                continue;
            }

            if !buffer.is_empty() {
                buffer.push('\n');
            }
            buffer.push_str(trimmed);

            match serde_json::from_str::<JsonRpcRequest>(&buffer) {
                Ok(request) => {
                    buffer.clear();

                    // Notifications without id do not receive responses
                    let req_id = match &request.id {
                        Some(id) => id.clone(),
                        None => {
                            if request.method == "notifications/initialized" {
                                eprintln!("[newton-mcp-server] Client initialized successfully");
                            }
                            continue;
                        }
                    };

                    let response = self
                        .handle_request(&request.method, request.params, req_id)
                        .await;
                    Self::write_response(&mut stdout, &response).await?;
                }
                Err(err) => {
                    if err.is_eof() {
                        // Incomplete JSON chunk across multiple lines; wait for next line
                        continue;
                    }
                    eprintln!("[newton-mcp-server] Parse error: {}", err);
                    buffer.clear();
                    let err_resp = JsonRpcResponse::error(Value::Null, -32700, "Parse error", None);
                    Self::write_response(&mut stdout, &err_resp).await?;
                }
            }
        }

        eprintln!("[newton-mcp-server] Standard I/O closed. Exiting server.");
        Ok(())
    }

    async fn handle_request(
        &self,
        method: &str,
        params: Option<Value>,
        id: Value,
    ) -> JsonRpcResponse {
        match method {
            "initialize" => JsonRpcResponse::success(
                id,
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "newton-lms-mcp-server",
                        "version": "0.1.0"
                    }
                }),
            ),
            "ping" => JsonRpcResponse::success(id, json!({})),
            "tools/list" => {
                let tools_list = tools::list_tools();
                JsonRpcResponse::success(id, json!({ "tools": tools_list }))
            }
            "tools/call" => {
                let params_obj = params.unwrap_or(Value::Null);
                let tool_name = params_obj
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("");
                let arguments = params_obj.get("arguments").cloned().unwrap_or(json!({}));

                let result = tools::call_tool(
                    tool_name,
                    arguments,
                    &self.newton_client,
                    &self.judge0_client,
                    &self.jev_client,
                    &self.telemetry_client,
                    &self.supabase_client,
                )
                .await;

                JsonRpcResponse::success(id, serde_json::to_value(&result).unwrap_or(json!({})))
            }
            unknown => {
                JsonRpcResponse::error(id, -32601, format!("Method not found: {}", unknown), None)
            }
        }
    }

    async fn write_response<W: AsyncWriteExt + Unpin>(
        writer: &mut W,
        response: &JsonRpcResponse,
    ) -> Result<()> {
        let serialized = serde_json::to_string(response)?;
        writer.write_all(serialized.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
        Ok(())
    }
}
