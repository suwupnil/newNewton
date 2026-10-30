use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::{JevClient, NewtonClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "decide_strategy_and_language".to_string(),
        description: "Uses TypeSafe Jev System One (if TYPESAFE_API_KEY is configured) to analyze problem constraints, runtime limits, and course syllabus to pick the optimal programming language (e.g. C++ for $O(N)$ tight limits vs. Python). If Jev is not configured, provides constraints and allowed languages so the MCP client can decide before solving.".to_string(),
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
                "course_hash": {
                    "type": "string",
                    "description": "Optional parent course hash. If omitted, uses active parent course."
                }
            },
            "required": ["assignment_hash", "question_hash"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LanguageStrategyResult {
    pub jev_system_one_used: bool,
    pub recommended_language_id: Option<i64>,
    pub recommended_language_name: Option<String>,
    pub reasoning: String,
    pub constraints: String,
    pub allowed_languages: Vec<AllowedLanguageOption>,
    pub client_decision_directive: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AllowedLanguageOption {
    pub language_id: i64,
    pub language_text: String,
    pub cpu_time_limit: Option<f64>,
    pub memory_limit: Option<i64>,
}

pub async fn execute(
    newton_client: &Arc<NewtonClient>,
    jev_client: &Arc<JevClient>,
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

    let pg = match newton_client.get_playground_details(&playground_hash).await {
        Ok(p) => p,
        Err(e) => {
            return CallToolResult::error(format!("Failed to load playground details: {}", e))
        }
    };

    let question = match pg.assignment_question {
        Some(q) => q,
        None => return CallToolResult::error("Playground does not contain question details"),
    };

    let constraints = question
        .constraints
        .unwrap_or_else(|| "Standard limits".to_string());
    let title = question.question_title;

    let mut allowed_pairs = Vec::new();
    let mut allowed_options = Vec::new();

    for lang in &question.assignment_question_language_mappings {
        allowed_pairs.push((lang.language_id, lang.language_text.clone()));
        allowed_options.push(AllowedLanguageOption {
            language_id: lang.language_id,
            language_text: lang.language_text.clone(),
            cpu_time_limit: lang.cpu_time_limit,
            memory_limit: lang.memory_limit,
        });
    }

    let course_name = newton_client
        .get_applied_courses()
        .await
        .ok()
        .and_then(|cs| {
            cs.into_iter()
                .find(|c| c.hash == parent_hash)
                .map(|c| c.title)
        });

    let decision = jev_client
        .decide_language(
            &title,
            &constraints,
            &allowed_pairs,
            course_name
                .as_deref()
                .or(Some("Newton School of Technology CS+AI")),
        )
        .await;

    let directive = if decision.jev_available {
        "TypeSafe Jev System One selected the optimal language above. You can proceed using this recommendation, or choose an alternate allowed language if desired.".to_string()
    } else {
        "TypeSafe Jev is inactive (TYPESAFE_API_KEY not configured). The MCP client agent should make the final language decision based on the constraints and allowed languages listed above.".to_string()
    };

    let result = LanguageStrategyResult {
        jev_system_one_used: decision.jev_available,
        recommended_language_id: decision.selected_language_id,
        recommended_language_name: decision.selected_language,
        reasoning: decision.reasoning,
        constraints,
        allowed_languages: allowed_options,
        client_decision_directive: directive,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
    }
}
