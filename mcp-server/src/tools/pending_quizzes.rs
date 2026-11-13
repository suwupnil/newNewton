use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::{NewtonClient, SupabaseClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_pending_quizzes".to_string(),
        description: "Retrieves unsubmitted quizzes and assessments across the enrolled courses. Cross-references newNewton's solutions for verified answers, calculates deadlines and earnable XP (halved if past deadline), and reports current attempt status ('NOT_STARTED' or 'IN_PROGRESS'). Supports subject filtering.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash (defaults to active parent admin course)."
                },
                "subject": {
                    "type": "string",
                    "description": "Optional subject filter by name or abbreviation (e.g. 'PSP', 'Mathematics-I', 'Maths', 'S&AI')."
                },
                "only_solvable": {
                    "type": "boolean",
                    "description": "If true, only returns quizzes with verified answers available in newNewton's solutions.",
                    "default": false
                }
            }
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingQuizzesResult {
    pub course_hash: String,
    pub total_pending_quizzes: usize,
    #[serde(alias = "solvable_by_supabase_count")]
    pub solvable_by_solutions_count: usize,
    pub unstarted_count: usize,
    pub in_progress_count: usize,
    pub quizzes: Vec<PendingQuizItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingQuizItem {
    pub assessment_hash: String,
    pub title: String,
    pub subject_title: String,
    pub subject_hash: String,
    pub total_questions: usize,
    pub max_xp: i64,
    pub deadline: Option<String>,
    pub is_past_deadline: bool,
    pub attempt_status: String,
    #[serde(alias = "has_supabase_solution")]
    pub has_solution: bool,
    pub topics: Vec<String>,
}

pub async fn execute(
    client: &Arc<NewtonClient>,
    supabase_client: &Arc<SupabaseClient>,
    args: Value,
) -> CallToolResult {
    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to determine course hash: {}", e))
            }
        },
    };

    let subject_filter = args
        .get("subject")
        .and_then(|s| s.as_str())
        .map(|s| s.trim().to_lowercase());

    let only_solvable = args
        .get("only_solvable")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);

    // Fetch assessments and Supabase solved set in parallel
    let (assessments_res, solved_set_res) = tokio::join!(
        client.get_assessments(&parent_hash),
        supabase_client.get_all_solved_assessment_hashes()
    );

    let assessments = match assessments_res {
        Ok(a) => a,
        Err(e) => {
            return CallToolResult::error(format!(
                "Failed to fetch assessments from LMS for {}: {}",
                parent_hash, e
            ))
        }
    };

    let solved_set = solved_set_res.unwrap_or_default();

    let mut pending_items = Vec::new();
    let mut solvable_count = 0;
    let mut unstarted_count = 0;
    let mut in_progress_count = 0;

    let now = chrono::Utc::now();

    for item in assessments {
        // Filter strictly for unsubmitted assessments
        if let Some(ref mapping) = item.course_user_assessment_mapping {
            if mapping.completed {
                continue;
            }
        }

        let subject_title = item
            .course
            .as_ref()
            .and_then(|c| c.short_display_name.as_ref().or(Some(&c.title)))
            .cloned()
            .unwrap_or_else(|| "General".to_string());

        let subject_hash = item
            .course
            .as_ref()
            .map(|c| c.hash.clone())
            .unwrap_or_else(|| parent_hash.clone());

        // Apply subject filter if specified
        if let Some(ref filter) = subject_filter {
            let matches = subject_title.to_lowercase().contains(filter)
                || item.title.to_lowercase().contains(filter)
                || subject_hash.to_lowercase() == *filter;
            if !matches {
                continue;
            }
        }

        let has_supabase = solved_set.contains(&item.hash);
        if only_solvable && !has_supabase {
            continue;
        }

        if has_supabase {
            solvable_count += 1;
        }

        let attempt_status = match item.course_user_assessment_mapping.as_ref() {
            Some(_) => {
                in_progress_count += 1;
                "IN_PROGRESS".to_string()
            }
            None => {
                unstarted_count += 1;
                "NOT_STARTED".to_string()
            }
        };

        // Deadline & XP calculation
        let (raw_xp, deadline_str, is_past_deadline) = if let Some(ref xp) = item.earnable_xp {
            let raw = xp.earnable_points.unwrap_or(item.max_marks.unwrap_or(0));
            let d_str = xp.deadline.clone();
            let past = if let Some(ref d) = d_str {
                match chrono::DateTime::parse_from_rfc3339(d) {
                    Ok(dt) => now > dt.with_timezone(&chrono::Utc),
                    Err(_) => false,
                }
            } else {
                false
            };
            (raw, d_str, past)
        } else {
            (item.max_marks.unwrap_or(0), None, false)
        };

        // LMS awards half earnable points if submitted late
        let effective_xp = if is_past_deadline { raw_xp / 2 } else { raw_xp };

        let total_q = item
            .course_user_assessment_mapping
            .as_ref()
            .and_then(|m| m.total_question_count)
            .or(item.total_questions)
            .unwrap_or(0);

        pending_items.push(PendingQuizItem {
            assessment_hash: item.hash,
            title: item.title,
            subject_title,
            subject_hash,
            total_questions: total_q,
            max_xp: effective_xp,
            deadline: deadline_str,
            is_past_deadline,
            attempt_status,
            has_solution: has_supabase,
            topics: item.topics,
        });
    }

    let result = PendingQuizzesResult {
        course_hash: parent_hash,
        total_pending_quizzes: pending_items.len(),
        solvable_by_solutions_count: solvable_count,
        unstarted_count,
        in_progress_count,
        quizzes: pending_items,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Failed to serialize result: {}", e)),
    }
}
