use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "submit_quiz_answers".to_string(),
        description: "Saves and/or finalizes quiz answers on Newton LMS. Accepts individual questions or batches so the client has full control over timing and pacing. When 'finalize' is false (default), answers are saved as drafts on LMS without completing the quiz. When 'finalize' is true, the quiz attempt is finalized and submitted.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assessment_hash": {
                    "type": "string",
                    "description": "Hash of the assessment/quiz."
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash (learning unit or parent admin course). Auto-detected if omitted."
                },
                "answers": {
                    "type": "array",
                    "description": "Array of question answers to save. Can contain one or multiple questions.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question_hash": {
                                "type": "string",
                                "description": "LMS question hash."
                            },
                            "answer": {
                                "type": "string",
                                "description": "Answer value (e.g. 'A', 'B', 'C', 'D' for MCQ, or text for fill-in-blanks/puzzle)."
                            },
                            "client_marked_at": {
                                "type": "integer",
                                "description": "Optional Unix timestamp in milliseconds when answer was selected. Defaults to current time."
                            }
                        },
                        "required": ["question_hash", "answer"]
                    }
                },
                "finalize": {
                    "type": "boolean",
                    "description": "If false (default), answers are saved on LMS as drafts without finalizing. If true, completes and finalizes the assessment attempt.",
                    "default": false
                }
            },
            "required": ["assessment_hash"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitQuizResult {
    pub assessment_hash: String,
    pub course_hash: String,
    pub total_answers_processed: usize,
    pub successfully_saved_count: usize,
    pub finalized: bool,
    pub attempt_status: String,
    pub saved_questions: Vec<SavedQuestionStatus>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedQuestionStatus {
    pub question_hash: String,
    pub answer: String,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnswerInput {
    question_hash: String,
    answer: String,
    client_marked_at: Option<i64>,
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

    let finalize = args.get("finalize").and_then(|f| f.as_bool()).unwrap_or(false);

    let answers: Vec<AnswerInput> = args
        .get("answers")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let mut saved_questions = Vec::new();
    let mut successfully_saved = 0;

    for ans in &answers {
        let trimmed_ans = ans.answer.trim();
        let result = client
            .save_quiz_question(
                &effective_course_hash,
                &clean_assessment_hash,
                &ans.question_hash,
                Some(trimmed_ans),
                Some(trimmed_ans),
                ans.client_marked_at,
            )
            .await;

        match result {
            Ok(_) => {
                successfully_saved += 1;
                saved_questions.push(SavedQuestionStatus {
                    question_hash: ans.question_hash.clone(),
                    answer: trimmed_ans.to_string(),
                    status: "saved".to_string(),
                    error: None,
                });
            }
            Err(e) => {
                saved_questions.push(SavedQuestionStatus {
                    question_hash: ans.question_hash.clone(),
                    answer: trimmed_ans.to_string(),
                    status: "error".to_string(),
                    error: Some(e.to_string()),
                });
            }
        }
    }

    let (attempt_status, message) = if finalize {
        match client
            .finalize_quiz(&effective_course_hash, &clean_assessment_hash)
            .await
        {
            Ok(_) => (
                "COMPLETED_AND_SUBMITTED".to_string(),
                format!(
                    "Assessment {} successfully finalized and submitted on LMS. Processed {} questions ({} saved).",
                    clean_assessment_hash, answers.len(), successfully_saved
                ),
            ),
            Err(e) => (
                "FINALIZATION_FAILED".to_string(),
                format!(
                    "Questions saved, but failed to finalize quiz: {}. Saved {} questions.",
                    e, successfully_saved
                ),
            ),
        }
    } else {
        (
            "SAVED_AS_DRAFT".to_string(),
            format!(
                "Successfully saved {} questions as drafts on LMS for assessment {}. Finalize was false; the quiz remains open for student review or subsequent submissions.",
                successfully_saved, clean_assessment_hash
            ),
        )
    };

    let is_finalized = attempt_status == "COMPLETED_AND_SUBMITTED";

    let result = SubmitQuizResult {
        assessment_hash: clean_assessment_hash,
        course_hash: effective_course_hash,
        total_answers_processed: answers.len(),
        successfully_saved_count: successfully_saved,
        finalized: is_finalized,
        attempt_status,
        saved_questions,
        message,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Failed to serialize result: {}", e)),
    }
}
