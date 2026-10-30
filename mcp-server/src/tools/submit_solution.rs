use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

use crate::api::{NewtonClient, TelemetryClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "submit_assignment_solution".to_string(),
        description: "Submits solution code to Newton LMS for full grading against all hidden and public test cases. Evaluates whether all test cases passed, returns per-test-case timing/memory diagnostics, and provides re-analysis instructions if any test failed.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assignment_hash": {
                    "type": "string",
                    "description": "Hash of the assignment containing the question."
                },
                "question_hash": {
                    "type": "string",
                    "description": "Hash of the question being submitted."
                },
                "source_code": {
                    "type": "string",
                    "description": "The complete solution code to submit."
                },
                "language_id": {
                    "type": "integer",
                    "description": "Target language ID (e.g. 71 for Python 3.13, 54 for C++, 62 for Java)."
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional parent course hash. If omitted, uses the active parent course."
                },
                "fire_telemetry": {
                    "type": "boolean",
                    "description": "Whether to fire browser-mirrored telemetry save events (defaults to server config).",
                    "default": false
                }
            },
            "required": ["assignment_hash", "question_hash", "source_code", "language_id"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmissionEvaluationResult {
    pub all_test_cases_passing: bool,
    pub wrong_submission: bool,
    pub passed_test_cases: usize,
    pub total_test_cases: usize,
    pub submission_status: String,
    pub test_case_breakdown: Vec<TestCaseOutcome>,
    pub playground_hash: String,
    pub reanalysis_guidance: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestCaseOutcome {
    pub index: usize,
    pub is_hidden: bool,
    pub status: i64,
    pub status_text: String,
    pub time_seconds: Option<f64>,
    pub memory_kb: Option<i64>,
}

pub async fn execute(
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

    // If telemetry mirroring requested, fire editor save event
    if fire_telemetry {
        if let Ok(username) = newton_client.get_username().await {
            telemetry_client
                .emit_editor_save(&playground_hash, &username, language_id, source_code.len())
                .await;
        }
    }

    // Capture initial submission hash to prevent polling stale/cached results
    let initial_sub_hash = newton_client
        .get_latest_submission(&playground_hash)
        .await
        .ok()
        .and_then(|s| s.hash);

    // Submit with run_hidden_test_cases = true
    if let Err(e) = newton_client
        .save_playground_code(&playground_hash, source_code, language_id, true)
        .await
    {
        return CallToolResult::error(format!("Failed to submit solution: {}", e));
    }

    // Poll latest submission for evaluation results (up to 25 seconds, checking every 1s)
    let max_retries = 25;
    for _ in 0..max_retries {
        tokio::time::sleep(Duration::from_millis(1000)).await;

        if let Ok(sub) = newton_client.get_latest_submission(&playground_hash).await {
            // Guard: ensure this is a new submission and not the prior one
            if let (Some(ref init), Some(ref curr)) = (&initial_sub_hash, &sub.hash) {
                if init == curr {
                    continue;
                }
            }

            // Guard: wait if still in queue (1) or processing (2)
            if let Some(status) = sub.current_status {
                if status == 1 || status == 2 {
                    continue;
                }
            }

            let total_cases = sub.submission_test_case_mappings.len();
            if total_cases > 0 {
                let passed_cases = sub.number_of_test_cases_passing;
                let all_passed = !sub.wrong_submission && passed_cases == total_cases;

                let mut breakdown = Vec::new();
                for (idx, mapping) in sub.submission_test_case_mappings.iter().enumerate() {
                    let is_hidden = mapping
                        .assignment_question_test_case_mapping
                        .as_ref()
                        .map(|m| m.hidden)
                        .unwrap_or(true);
                    let status_text = mapping.status_text.clone().unwrap_or_else(|| match mapping
                        .status
                    {
                        3 => "Accepted".to_string(),
                        4 => "Wrong Answer".to_string(),
                        5 => "Time Limit Exceeded".to_string(),
                        6 => "Compilation Error".to_string(),
                        11 => "Runtime Error".to_string(),
                        _ => format!("Status {}", mapping.status),
                    });

                    breakdown.push(TestCaseOutcome {
                        index: idx + 1,
                        is_hidden,
                        status: mapping.status,
                        status_text,
                        time_seconds: mapping.time,
                        memory_kb: mapping.memory,
                    });
                }

                let reanalysis_guidance = if !all_passed {
                    let mut guidance = Vec::new();
                    let failed_cases: Vec<&TestCaseOutcome> =
                        breakdown.iter().filter(|b| b.status != 3).collect();
                    let tle = failed_cases.iter().any(|b| b.status == 5);
                    let wa = failed_cases.iter().any(|b| b.status == 4);
                    let re = failed_cases.iter().any(|b| b.status == 11);

                    if tle {
                        guidance.push("Time Limit Exceeded detected: Check for infinite loops or $O(N^2)$ algorithm where $O(N)$ or $O(N \\log N)$ is required. Consider faster I/O or pre-allocations.");
                    }
                    if wa {
                        guidance.push("Wrong Answer detected: Verify boundary edge cases (e.g. $N=0, 1$, negative numbers, large constraints, integer overflow, trailing spaces or formatting).");
                    }
                    if re {
                        guidance.push("Runtime Error detected: Check for index out-of-bounds, division by zero, null pointer, recursion depth limit, or memory exhaustion.");
                    }
                    guidance.push("ACTION: Re-analyze your logic, use run_playground_code with custom edge cases to verify, then re-submit.");

                    Some(guidance.join(" "))
                } else {
                    None
                };

                let res = SubmissionEvaluationResult {
                    all_test_cases_passing: all_passed,
                    wrong_submission: sub.wrong_submission,
                    passed_test_cases: passed_cases,
                    total_test_cases: total_cases,
                    submission_status: if all_passed {
                        "Accepted - All Test Cases Passed".to_string()
                    } else {
                        "Failed Some Test Cases".to_string()
                    },
                    test_case_breakdown: breakdown,
                    playground_hash,
                    reanalysis_guidance,
                };

                return match CallToolResult::json(&res) {
                    Ok(r) => r,
                    Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
                };
            }
        }
    }

    CallToolResult::error("Submission was sent, but grading evaluation polling timed out. Please check again in a few moments.")
}
