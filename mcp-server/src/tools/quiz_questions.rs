use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::{NewtonClient, SupabaseClient};
use crate::mcp::protocol::{CallToolResult, Tool};
use crate::models::{
    clean_html_text, determine_answer_value, find_matching_db_question,
};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_quiz_questions".to_string(),
        description: "Retrieves all questions for an assessment attempt. Automatically acknowledges honor code if needed, opens or resumes the LMS attempt session, and queries Supabase for verified answers. Pre-fills questions with verified Supabase answers (with option shuffling detection) and clearly marks unsolved questions for the client LLM to reason and answer.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "assessment_hash": {
                    "type": "string",
                    "description": "Hash of the assessment/quiz to retrieve questions for."
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash (learning unit or parent admin course). Auto-detected if omitted."
                }
            },
            "required": ["assessment_hash"]
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuizQuestionsDetails {
    pub assessment_hash: String,
    pub course_hash: String,
    pub total_questions: usize,
    pub supabase_solved_count: usize,
    pub unsolved_count: usize,
    pub resolution_status: String,
    pub questions: Vec<QuizQuestionInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuizQuestionInfo {
    pub index: usize,
    pub question_hash: String,
    pub question_type: String,
    pub prompt: String,
    pub options: Vec<QuizOptionInfo>,
    pub current_saved_answer: Option<String>,
    pub supabase_solution: Option<SupabaseSolutionInfo>,
    pub action_needed: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuizOptionInfo {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupabaseSolutionInfo {
    pub suggested_answer: String,
    pub explanation: Option<String>,
    pub marks: Option<f64>,
}

pub async fn execute(
    client: &Arc<NewtonClient>,
    supabase_client: &Arc<SupabaseClient>,
    args: Value,
) -> CallToolResult {
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

    // Parallel fetch: LMS attempt session and Supabase verified solutions
    let (session_res, supabase_res) = tokio::join!(
        client.get_quiz_session(&effective_course_hash, &clean_assessment_hash),
        supabase_client.get_quiz_solutions(&clean_assessment_hash)
    );

    let session = match session_res {
        Ok(s) => s,
        Err(e) => {
            return CallToolResult::error(format!(
                "Failed to open/resume quiz session on LMS for assessment {}: {}",
                clean_assessment_hash, e
            ))
        }
    };

    let db_doc = supabase_res.unwrap_or(None);
    let db_questions = db_doc
        .as_ref()
        .map(|d| d.questions.as_slice())
        .unwrap_or(&[]);

    let mut question_infos = Vec::new();
    let mut solved_count = 0;

    for (i, active_q) in session.questions.iter().enumerate() {
        let index = i + 1;
        let matched_db = find_matching_db_question(active_q, db_questions, i);

        // Extract prompt
        let prompt_raw = active_q
            .multiple_choice_question
            .as_ref()
            .and_then(|m| m.question_text.as_deref())
            .or(active_q.question_text.as_deref())
            .unwrap_or("");
        let prompt_clean = clean_html_text(prompt_raw);

        // Extract options if MCQ
        let mut options = Vec::new();
        if let Some(ref mcq) = active_q.multiple_choice_question {
            let choice_defs = [
                ("A", mcq.choice_a_text.as_deref()),
                ("B", mcq.choice_b_text.as_deref()),
                ("C", mcq.choice_c_text.as_deref()),
                ("D", mcq.choice_d_text.as_deref()),
                ("E", mcq.choice_e_text.as_deref()),
            ];
            for (letter, opt_text) in choice_defs {
                if let Some(txt) = opt_text {
                    let clean_opt = clean_html_text(txt);
                    if !clean_opt.is_empty() {
                        options.push(QuizOptionInfo {
                            id: letter.to_string(),
                            text: clean_opt,
                        });
                    }
                }
            }
        }

        let q_type_num = active_q
            .multiple_choice_question
            .as_ref()
            .and_then(|m| m.question_type)
            .or(active_q.question_type)
            .unwrap_or(1);

        let q_type_str = if q_type_num == 1 {
            "MCQ".to_string()
        } else {
            "TEXT_PUZZLE".to_string()
        };

        let current_saved = active_q
            .marked_choice
            .as_ref()
            .or(active_q.input_puzzle_answer.as_ref())
            .or(active_q.input_answer.as_ref())
            .or(active_q.value.as_ref())
            .cloned();

        let (supabase_solution, action_needed) = if let Some(db_q) = matched_db {
            solved_count += 1;
            let ans = determine_answer_value(active_q, db_q);
            let sol = SupabaseSolutionInfo {
                suggested_answer: ans.clone(),
                explanation: db_q.correct_explanation.clone(),
                marks: db_q.marks,
            };
            let action = format!(
                "USE_SUPABASE_ANSWER: Use suggested answer '{}' directly from verified database",
                ans
            );
            (Some(sol), action)
        } else {
            let action = "MCP_CLIENT_SOLVE: No Supabase answer found. Think and determine the correct answer.".to_string();
            (None, action)
        };

        question_infos.push(QuizQuestionInfo {
            index,
            question_hash: active_q.hash.clone(),
            question_type: q_type_str,
            prompt: prompt_clean,
            options,
            current_saved_answer: current_saved,
            supabase_solution,
            action_needed,
        });
    }

    let total_q = question_infos.len();
    let unsolved = total_q.saturating_sub(solved_count);

    let resolution_status = if solved_count == total_q && total_q > 0 {
        "ALL_SOLUTIONS_FOUND_IN_SUPABASE".to_string()
    } else if solved_count > 0 {
        format!(
            "PARTIAL_SOLUTIONS_FOUND ({}/{} from Supabase, {} unsolved)",
            solved_count, total_q, unsolved
        )
    } else {
        "NO_SUPABASE_SOLUTIONS (MCP client must think and solve all questions)".to_string()
    };

    let result = QuizQuestionsDetails {
        assessment_hash: clean_assessment_hash,
        course_hash: effective_course_hash,
        total_questions: total_q,
        supabase_solved_count: solved_count,
        unsolved_count: unsolved,
        resolution_status,
        questions: question_infos,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Failed to serialize result: {}", e)),
    }
}
