use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "save_quiz_answer".to_string(),
        description: "Saves a draft answer for a specific quiz/assessment question on Newton LMS without finalizing the attempt. Supports MCQs (e.g. 'A', 'B', 'C', 'D'), MSQs, numerical values, and fill-in-blanks text.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assessment_hash": {
                    "type": "string",
                    "description": "Hash of the assessment/quiz."
                },
                "question_hash": {
                    "type": "string",
                    "description": "LMS question hash or ID to save the answer for."
                },
                "answer": {
                    "type": "string",
                    "description": "Answer value to save (e.g. 'A', 'B', 'C', 'D' for MCQ, or text for fill-in-blanks/puzzle)."
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash (learning unit or parent admin course). Auto-detected if omitted."
                },
                "client_marked_at": {
                    "type": "integer",
                    "description": "Optional Unix timestamp in milliseconds when answer was chosen. Defaults to current time."
                }
            },
            "required": ["assessment_hash", "question_hash", "answer"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveQuizAnswerResult {
    pub assessment_hash: String,
    pub course_hash: String,
    pub question_hash: String,
    pub answer: String,
    pub status: String,
    pub response: Value,
}

pub async fn execute(client: &Arc<NewtonClient>, args: Value) -> CallToolResult {
    let raw_assessment_hash = match args.get("assessment_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim(),
        _ => return CallToolResult::error("Missing required parameter: assessment_hash"),
    };
    let clean_assessment_hash = raw_assessment_hash
        .trim_start_matches("h/")
        .trim_matches('/')
        .to_string();

    let raw_question_hash = match args
        .get("question_hash")
        .or_else(|| args.get("question_id"))
        .and_then(|h| h.as_str())
    {
        Some(h) if !h.trim().is_empty() => h.trim(),
        _ => return CallToolResult::error("Missing required parameter: question_hash"),
    };
    let clean_question_hash = raw_question_hash
        .trim_start_matches("h/")
        .trim_matches('/')
        .to_string();

    let answer = match args.get("answer").and_then(|a| a.as_str()) {
        Some(a) => a.trim(),
        _ => return CallToolResult::error("Missing required parameter: answer"),
    };

    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to determine course hash: {}", e))
            }
        },
    };

    let effective_course_hash = match client
        .resolve_assessment_course_hash(&parent_hash, &clean_assessment_hash)
        .await
    {
        Ok(h) => h,
        Err(_) => parent_hash.clone(),
    };

    let client_marked_at = args.get("client_marked_at").and_then(|t| t.as_i64());

    match client
        .save_quiz_question(
            &effective_course_hash,
            &clean_assessment_hash,
            &clean_question_hash,
            Some(answer),
            Some(answer),
            client_marked_at,
        )
        .await
    {
        Ok(resp) => {
            let res = SaveQuizAnswerResult {
                assessment_hash: clean_assessment_hash,
                course_hash: effective_course_hash,
                question_hash: clean_question_hash,
                answer: answer.to_string(),
                status: "saved".to_string(),
                response: resp,
            };
            match serde_json::to_string_pretty(&res) {
                Ok(s) => CallToolResult::text(s),
                Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
            }
        }
        Err(e) => CallToolResult::error(format!(
            "Failed to save quiz answer for question {}: {}",
            clean_question_hash, e
        )),
    }
}
