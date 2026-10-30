use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_pending_assignments".to_string(),
        description: "Retrieves pending coding assignments (unattempted and in-progress) for the course. Supports filtering by specific course subject (e.g. 'PSP', 'Mathematics-I', 'S&AI', or subject hash). Provides assignment hashes, problem titles, difficulty levels, point values, and deadlines.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "course_hash": {
                    "type": "string",
                    "description": "Optional course hash (parent admin course or specific subject). Defaults to active parent admin course."
                },
                "subject": {
                    "type": "string",
                    "description": "Optional subject filter by name, abbreviation (e.g. 'PSP', 'Maths', 'S&AI'), or subject course hash."
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of assignments to return (default: 20).",
                    "default": 20
                },
                "offset": {
                    "type": "integer",
                    "description": "Pagination offset (default: 0).",
                    "default": 0
                },
                "status_filter": {
                    "type": "string",
                    "description": "Filter by status: 'all_pending' (1,2), 'not_attempted' (1), or 'in_progress' (2). Default is 'all_pending'.",
                    "default": "all_pending"
                }
            }
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingAssignmentsResult {
    pub course_hash: String,
    pub total_pending_assignments: usize,
    pub unattempted_questions_count: usize,
    pub in_progress_questions_count: usize,
    pub assignments: Vec<PendingAssignmentGroup>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingAssignmentGroup {
    pub assignment_hash: String,
    pub title: String,
    pub subject_title: String,
    pub subject_hash: String,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub pending_questions: Vec<PendingQuestionItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingQuestionItem {
    pub question_hash: String,
    pub title: String,
    pub difficulty_type: Option<i64>,
    pub difficulty_text: String,
    pub status: String,
    pub earnable_points: Option<i64>,
    pub earned_points: Option<i64>,
    pub deadline: Option<String>,
    pub topics: Vec<String>,
}

pub async fn execute(client: &Arc<NewtonClient>, args: Value) -> CallToolResult {
    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to determine course hash: {}", e))
            }
        },
    };

    let limit = args.get("limit").and_then(|l| l.as_u64()).unwrap_or(20) as usize;
    let offset = args.get("offset").and_then(|o| o.as_u64()).unwrap_or(0) as usize;

    let status_filter = match args.get("status_filter").and_then(|s| s.as_str()) {
        Some("not_attempted") => "1",
        Some("in_progress") => "2",
        _ => "1,2",
    };

    let assignments_resp = match client
        .get_assignments(&parent_hash, status_filter, limit, offset)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return CallToolResult::error(format!("Failed to fetch pending assignments: {}", e))
        }
    };

    let subject_filter = args
        .get("subject")
        .and_then(|s| s.as_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let mut unattempted_count = 0;
    let mut in_progress_count = 0;
    let mut pending_groups = Vec::new();

    for item in assignments_resp.results {
        let mut pending_questions = Vec::new();
        let sub_title = item
            .course
            .as_ref()
            .map(|c| {
                c.short_display_name
                    .clone()
                    .unwrap_or_else(|| c.title.clone())
            })
            .unwrap_or_else(|| "General".to_string());
        let sub_hash = item
            .course
            .as_ref()
            .map(|c| c.hash.clone())
            .unwrap_or_else(|| parent_hash.clone());

        // Check if subject filter matches
        if let Some(ref filter) = subject_filter {
            let matches_title = sub_title.to_lowercase().contains(filter);
            let matches_hash = sub_hash.to_lowercase() == *filter;
            if !matches_title && !matches_hash {
                continue;
            }
        }

        for q in item.assignment_questions {
            let is_pending = match q.attempt_status {
                Some(1) => {
                    unattempted_count += 1;
                    true
                }
                Some(2) => {
                    in_progress_count += 1;
                    true
                }
                _ => false,
            };

            if is_pending {
                let diff_text = match q.difficulty_type {
                    Some(1) => "Easy",
                    Some(2) => "Medium",
                    Some(3) => "Hard",
                    _ => "Standard",
                }
                .to_string();

                let status_str = match q.attempt_status {
                    Some(1) => "Not Attempted",
                    Some(2) => "In Progress",
                    _ => "Pending",
                }
                .to_string();

                pending_questions.push(PendingQuestionItem {
                    question_hash: q.hash,
                    title: q.question_title,
                    difficulty_type: q.difficulty_type,
                    difficulty_text: diff_text,
                    status: status_str,
                    earnable_points: q.earnable_points,
                    earned_points: q.earned_points,
                    deadline: q.deadline,
                    topics: q.topics,
                });
            }
        }

        if !pending_questions.is_empty() {
            pending_groups.push(PendingAssignmentGroup {
                assignment_hash: item.hash,
                title: item.title,
                subject_title: sub_title,
                subject_hash: sub_hash,
                start_timestamp: item.start_timestamp,
                end_timestamp: item.end_timestamp,
                pending_questions,
            });
        }
    }

    let result = PendingAssignmentsResult {
        course_hash: parent_hash,
        total_pending_assignments: pending_groups.len(),
        unattempted_questions_count: unattempted_count,
        in_progress_questions_count: in_progress_count,
        assignments: pending_groups,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
    }
}
