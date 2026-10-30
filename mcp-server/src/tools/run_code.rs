use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::{Judge0Client, NewtonClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "run_playground_code".to_string(),
        description: "Executes code on the Newton School Judge0 remote execution cluster with custom stdin input BEFORE submitting. Returns stdout, stderr, compilation errors, execution time, and memory usage.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assignment_hash": {
                    "type": "string",
                    "description": "Hash of the assignment containing the question."
                },
                "question_hash": {
                    "type": "string",
                    "description": "Hash of the question being tested."
                },
                "source_code": {
                    "type": "string",
                    "description": "The full source code to execute."
                },
                "language_id": {
                    "type": "integer",
                    "description": "Target language ID (e.g. 71 for Python 3.13, 54 for C++, 62 for Java)."
                },
                "custom_input": {
                    "type": "string",
                    "description": "Custom standard input (stdin) to pass to the program during execution.",
                    "default": ""
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash. If omitted, uses the active parent course."
                }
            },
            "required": ["assignment_hash", "question_hash", "source_code", "language_id"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunCodeResponse {
    pub is_success: bool,
    pub status_code: i64,
    pub status_description: String,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub execution_time_seconds: Option<String>,
    pub memory_used_kb: Option<i64>,
    pub playground_hash: String,
}

pub async fn execute(
    newton_client: &Arc<NewtonClient>,
    judge0_client: &Arc<Judge0Client>,
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

    let custom_input = args
        .get("custom_input")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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

    let pg_details = newton_client
        .get_playground_details(&playground_hash)
        .await
        .ok();

    let mut pre_code: Option<&str> = None;
    let mut post_code: Option<&str> = None;
    let mut time_limit: Option<f64> = None;
    let mut mem_limit: Option<i64> = None;

    if let Some(pg) = &pg_details {
        if let Some(q) = &pg.assignment_question {
            if let Some(lang_map) = q
                .assignment_question_language_mappings
                .iter()
                .find(|m| m.language_id == language_id)
            {
                pre_code = lang_map.pre_function_code.as_deref();
                post_code = lang_map.post_function_code.as_deref();
                time_limit = lang_map.cpu_time_limit;
                mem_limit = lang_map.memory_limit;
            }
        }
    }

    match judge0_client
        .execute_code(
            &playground_hash,
            source_code,
            language_id,
            custom_input,
            time_limit,
            mem_limit,
            pre_code,
            None,
            post_code,
        )
        .await
    {
        Ok(exec) => {
            let res = RunCodeResponse {
                is_success: exec.is_accepted,
                status_code: exec.status_id,
                status_description: exec.status_description,
                stdout: exec.stdout,
                stderr: exec.stderr,
                compile_output: exec.compile_output,
                execution_time_seconds: exec.execution_time,
                memory_used_kb: exec.memory_used_kb,
                playground_hash,
            };
            match CallToolResult::json(&res) {
                Ok(r) => r,
                Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
            }
        }
        Err(e) => CallToolResult::error(format!("Judge0 test execution failed: {}", e)),
    }
}
