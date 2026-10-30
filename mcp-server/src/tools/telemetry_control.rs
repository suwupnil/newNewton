use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::{NewtonClient, TelemetryClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn configure_tool_definition() -> Tool {
    Tool {
        name: "configure_telemetry".to_string(),
        description: "Enables or disables browser telemetry event mirroring (editor_save_event dispatched to AWS ECS and OpenPanel). When disabled, the server operates in strictly minimal REST mode.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "enabled": {
                    "type": "boolean",
                    "description": "Set to true to mirror browser telemetry, or false to rely strictly on minimal REST."
                }
            },
            "required": ["enabled"]
        }),
    }
}

pub fn save_code_tool_definition() -> Tool {
    Tool {
        name: "save_editor_code".to_string(),
        description: "Saves code into the LMS cloud editor for a question without running or submitting test cases, optionally firing matching browser telemetry save events.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assignment_hash": {
                    "type": "string",
                    "description": "Hash of the assignment."
                },
                "question_hash": {
                    "type": "string",
                    "description": "Hash of the question."
                },
                "source_code": {
                    "type": "string",
                    "description": "Code to save in the cloud editor."
                },
                "language_id": {
                    "type": "integer",
                    "description": "Language ID (e.g. 71 for Python, 54 for C++, 62 for Java)."
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash."
                },
                "fire_telemetry": {
                    "type": "boolean",
                    "description": "Whether to fire browser telemetry events on save. Defaults to current telemetry configuration."
                }
            },
            "required": ["assignment_hash", "question_hash", "source_code", "language_id"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TelemetryStatusResult {
    pub telemetry_enabled: bool,
    pub mode: String,
    pub active_endpoints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveEditorCodeResult {
    pub playground_hash: String,
    pub saved_successfully: bool,
    pub telemetry_dispatched: bool,
    pub timestamp_ms: i64,
}

pub async fn execute_configure(
    telemetry_client: &Arc<TelemetryClient>,
    args: Value,
) -> CallToolResult {
    let enabled = match args.get("enabled").and_then(|v| v.as_bool()) {
        Some(e) => e,
        None => return CallToolResult::error("Missing required boolean parameter: enabled"),
    };

    telemetry_client.set_enabled(enabled);

    let endpoints = if enabled {
        vec![
            "https://e1-0850197d5e074be58352ddc860645af6.ecs.us-east-1.on.aws/events?cee=no"
                .to_string(),
            "https://openpanel-api.newtonschool.co/track".to_string(),
        ]
    } else {
        vec![]
    };

    let res = TelemetryStatusResult {
        telemetry_enabled: enabled,
        mode: if enabled {
            "Browser Telemetry Mirroring Active".to_string()
        } else {
            "Strict Minimal REST (Zero Telemetry)".to_string()
        },
        active_endpoints: endpoints,
    };

    match CallToolResult::json(&res) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
    }
}

pub async fn execute_save(
    newton_client: &Arc<NewtonClient>,
    telemetry_client: &Arc<TelemetryClient>,
    args: Value,
) -> CallToolResult {
    let assignment_hash = match args.get("assignment_hash").and_then(|v| v.as_str()) {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => return CallToolResult::error("Missing required parameter: assignment_hash"),
    };

    let question_hash = match args.get("question_hash").and_then(|v| v.as_str()) {
        Some(s) if !s.trim().is_empty() => s.trim(),
        _ => return CallToolResult::error("Missing required parameter: question_hash"),
    };

    let source_code = match args.get("source_code").and_then(|v| v.as_str()) {
        Some(s) => s,
        _ => return CallToolResult::error("Missing required parameter: source_code"),
    };

    let language_id = match args.get("language_id").and_then(|v| v.as_i64()) {
        Some(id) => id,
        _ => return CallToolResult::error("Missing required parameter: language_id"),
    };

    let fire_telemetry = args
        .get("fire_telemetry")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| telemetry_client.is_enabled());

    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match newton_client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to determine course hash: {}", e))
            }
        },
    };

    let playground_hash = match newton_client
        .get_question_playground_hash(&parent_hash, assignment_hash, question_hash)
        .await
    {
        Ok(h) => h,
        Err(e) => {
            return CallToolResult::error(format!("Failed to resolve playground hash: {}", e))
        }
    };

    if fire_telemetry {
        if let Ok(username) = newton_client.get_username().await {
            telemetry_client
                .emit_editor_save(&playground_hash, &username, language_id, source_code.len())
                .await;
        }
    }

    match newton_client
        .save_playground_code(&playground_hash, source_code, language_id, false)
        .await
    {
        Ok(_) => {
            let res = SaveEditorCodeResult {
                playground_hash,
                saved_successfully: true,
                telemetry_dispatched: fire_telemetry,
                timestamp_ms: chrono::Utc::now().timestamp_millis(),
            };
            match CallToolResult::json(&res) {
                Ok(r) => r,
                Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
            }
        }
        Err(e) => CallToolResult::error(format!("Failed to save code to playground: {}", e)),
    }
}
