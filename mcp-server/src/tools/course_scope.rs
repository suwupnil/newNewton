use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_course_scope".to_string(),
        description: "Fetches the full syllabus and scope of the parent admin course, including enrolled subjects, conducted lectures, and taught curriculum topics. Use this before solving assignments to ensure your code strictly adheres to concepts taught and does NOT use out-of-syllabus libraries or advanced constructs.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "course_hash": {
                    "type": "string",
                    "description": "Optional parent admin course hash. If omitted, automatically detects the enrolled parent admin course."
                }
            }
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseScopeResult {
    pub parent_course_hash: String,
    pub parent_course_title: String,
    pub enrolled_subjects: Vec<EnrolledSubjectSummary>,
    pub total_lectures_count: usize,
    pub taught_topics_by_subject: HashMap<String, Vec<String>>,
    pub all_taught_topics: Vec<String>,
    pub syllabus_guidance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrolledSubjectSummary {
    pub hash: String,
    pub title: String,
    pub short_name: String,
}

pub async fn execute(client: &Arc<NewtonClient>, args: Value) -> CallToolResult {
    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!(
                    "Failed to determine parent course hash: {}",
                    e
                ))
            }
        },
    };

    match get_course_scope_internal(client.as_ref(), &parent_hash).await {
        Ok(res) => match CallToolResult::json(&res) {
            Ok(call_res) => call_res,
            Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
        },
        Err(e) => CallToolResult::error(e),
    }
}

pub async fn get_course_scope_internal(
    client: &NewtonClient,
    parent_hash: &str,
) -> Result<CourseScopeResult, String> {
    let applied_courses = client
        .get_applied_courses()
        .await
        .map_err(|e| format!("Failed to load course details: {}", e))?;

    let parent_course = applied_courses.iter().find(|c| c.hash == parent_hash);
    let parent_title = parent_course
        .map(|c| c.title.clone())
        .unwrap_or_else(|| "Newton School Parent Course".to_string());

    let mut enrolled_subjects = Vec::new();
    if let Some(course) = parent_course {
        if let Some(children) = &course.children_courses {
            for admin_unit in &children.admin_unit_courses {
                for subject in &admin_unit.learning_unit_courses {
                    enrolled_subjects.push(EnrolledSubjectSummary {
                        hash: subject.hash.clone(),
                        title: subject.title.clone(),
                        short_name: subject.short_display_name.clone().unwrap_or_default(),
                    });
                }
            }
            for subject in &children.learning_unit_courses {
                if !enrolled_subjects.iter().any(|s| s.hash == subject.hash) {
                    enrolled_subjects.push(EnrolledSubjectSummary {
                        hash: subject.hash.clone(),
                        title: subject.title.clone(),
                        short_name: subject.short_display_name.clone().unwrap_or_default(),
                    });
                }
            }
        }
    }

    if enrolled_subjects.is_empty() {
        if let Ok(courses) = client.get_learning_courses(parent_hash).await {
            for subject in courses {
                enrolled_subjects.push(EnrolledSubjectSummary {
                    hash: subject.hash,
                    title: subject.title,
                    short_name: subject.short_display_name.unwrap_or_default(),
                });
            }
        }
    }

    // Fetch lectures to extract all taught topics and titles
    let lectures = client
        .get_lectures(parent_hash)
        .await
        .map_err(|e| format!("Failed to fetch course lectures: {}", e))?;

    let mut taught_topics_by_subject: HashMap<String, BTreeSet<String>> = HashMap::new();
    let mut all_topics = BTreeSet::new();

    for lec in &lectures {
        let subject_key = lec
            .course
            .as_ref()
            .map(|c| {
                c.short_display_name
                    .clone()
                    .unwrap_or_else(|| c.title.clone())
            })
            .unwrap_or_else(|| "General".to_string());

        let set = taught_topics_by_subject.entry(subject_key).or_default();

        // Add lecture title keywords/concepts
        let title_clean = lec.title.trim().to_string();
        if !title_clean.is_empty() {
            set.insert(title_clean.clone());
            all_topics.insert(title_clean);
        }

        // Add explicit topic tags
        for topic in &lec.topics {
            let t = topic.title.trim().to_string();
            if !t.is_empty() {
                set.insert(t.clone());
                all_topics.insert(t);
            }
        }
    }

    let topics_map: HashMap<String, Vec<String>> = taught_topics_by_subject
        .into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();

    let all_topics_vec: Vec<String> = all_topics.into_iter().collect();

    let guidance = "CRITICAL SYLLABUS DIRECTIVE: When generating code for this course, you MUST strictly confine your implementation to the taught topics above. Do NOT use non-standard third-party packages, advanced language abstractions (e.g. metaprogramming, complex concurrency primitives), or data structures not yet introduced in the curriculum. Keep solutions clean, idiomatic to beginner/intermediate level, and compliant with course expectations.".to_string();

    Ok(CourseScopeResult {
        parent_course_hash: parent_hash.to_string(),
        parent_course_title: parent_title,
        enrolled_subjects,
        total_lectures_count: lectures.len(),
        taught_topics_by_subject: topics_map,
        all_taught_topics: all_topics_vec,
        syllabus_guidance: guidance,
    })
}
