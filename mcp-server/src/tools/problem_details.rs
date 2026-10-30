use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_problem_details".to_string(),
        description: "Retrieves complete problem statement, input/output formats, examples, constraints, pre-written boilerplate code, commented instructions (e.g. # TODO: in editor), currently saved code, AND automatically injects curriculum scope boundaries and the student's authentic coding style guidelines directly into the response so LLM agents never violate syllabus or coding habits.".to_string(),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseScopeGuidance {
    pub parent_course_title: String,
    pub total_lectures_conducted: usize,
    pub all_taught_topics: Vec<String>,
    pub syllabus_directive: String,
    pub forbidden_constructs_advice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentStyleGuidelines {
    pub primary_language: String,
    pub indentation: String,
    pub variable_naming: String,
    pub function_style: String,
    pub comment_frequency: String,
    pub io_pattern: String,
    pub sample_snippet: Option<String>,
    pub emulation_instructions: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProblemDetailsResult {
    pub playground_hash: String,
    pub question_title: String,
    pub question_description_html: Option<String>,
    pub question_description_clean: Option<String>,
    pub input_format: Option<String>,
    pub output_format: Option<String>,
    pub example: Option<String>,
    pub example_clean: Option<String>,
    pub constraints: Option<String>,
    pub difficulty_type: Option<i64>,
    pub max_marks: Option<i64>,
    pub editor_current_saved_code: Option<String>,
    pub boilerplate_and_starter_templates: Vec<StarterCodeTemplate>,
    pub sample_test_cases: Vec<SampleTestCase>,
    pub course_scope_guidance: Option<CourseScopeGuidance>,
    pub student_style_guidelines: Option<StudentStyleGuidelines>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StarterCodeTemplate {
    pub language_id: i64,
    pub language_text: String,
    pub pre_function_code: Option<String>,
    pub function_code: Option<String>,
    pub post_function_code: Option<String>,
    pub cpu_time_limit: Option<f64>,
    pub memory_limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SampleTestCase {
    pub title: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub is_hidden: bool,
}

pub async fn execute(client: &Arc<NewtonClient>, args: Value) -> CallToolResult {
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
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to determine course hash: {}", e))
            }
        },
    };

    let playground_hash = match client
        .get_question_playground_hash(&parent_hash, assignment_hash, question_hash)
        .await
    {
        Ok(h) => h,
        Err(e) => {
            return CallToolResult::error(format!("Failed to resolve playground hash: {}", e))
        }
    };

    let pg = match client.get_playground_details(&playground_hash).await {
        Ok(p) => p,
        Err(e) => {
            return CallToolResult::error(format!("Failed to fetch playground details: {}", e))
        }
    };

    let q = match pg.assignment_question {
        Some(q) => q,
        None => return CallToolResult::error("Playground does not contain question details"),
    };

    // Concurrently fetch course scope guidance and student coding style profile to auto-inject
    let (scope_res, style_res) = tokio::join!(
        crate::tools::course_scope::get_course_scope_internal(client.as_ref(), &parent_hash),
        crate::tools::user_style::get_user_style_internal(client.as_ref(), &parent_hash, 3),
    );

    let course_scope_guidance = scope_res.ok().map(|scope| CourseScopeGuidance {
        parent_course_title: scope.parent_course_title,
        total_lectures_conducted: scope.total_lectures_count,
        all_taught_topics: scope.all_taught_topics,
        syllabus_directive: scope.syllabus_guidance,
        forbidden_constructs_advice: "CRITICAL SYLLABUS DIRECTIVE: Only use programming constructs, data structures, and algorithms taught so far in the curriculum lectures listed in all_taught_topics. Do NOT use constructs not yet taught (e.g. Trees, Graphs, Bitwise hacks, advanced itertools) even if they provide a faster or shorter solution.".to_string(),
    });

    let student_style_guidelines = style_res.ok().map(|style| {
        let sample_snippet = style.submissions.first().map(|s| s.submitted_code.clone());
        StudentStyleGuidelines {
            primary_language: style.primary_language,
            indentation: style.style_profile.indentation,
            variable_naming: style.style_profile.variable_naming,
            function_style: style.style_profile.function_style,
            comment_frequency: style.style_profile.comment_frequency,
            io_pattern: style.style_profile.io_pattern,
            sample_snippet,
            emulation_instructions: style.style_profile.emulation_instructions,
        }
    });

    let clean_desc = q.question_text.as_ref().map(|html| strip_html_tags(html));
    let clean_example = q.example.as_ref().map(|html| strip_html_tags(html));

    let mut starter_templates = Vec::new();
    for lang in q.assignment_question_language_mappings {
        starter_templates.push(StarterCodeTemplate {
            language_id: lang.language_id,
            language_text: lang.language_text,
            pre_function_code: lang.pre_function_code.filter(|s| !s.trim().is_empty()),
            function_code: lang.function_code.filter(|s| !s.trim().is_empty()),
            post_function_code: lang.post_function_code.filter(|s| !s.trim().is_empty()),
            cpu_time_limit: lang.cpu_time_limit,
            memory_limit: lang.memory_limit,
        });
    }

    let mut sample_test_cases = Vec::new();
    for tc in q.assignment_question_test_case_mappings {
        sample_test_cases.push(SampleTestCase {
            title: tc.title,
            input: tc.input,
            output: tc.output,
            is_hidden: tc.hidden,
        });
    }

    let result = ProblemDetailsResult {
        playground_hash,
        question_title: q.question_title,
        question_description_html: q.question_text,
        question_description_clean: clean_desc,
        input_format: q.input,
        output_format: q.output,
        example: q.example,
        example_clean: clean_example,
        constraints: q.constraints,
        difficulty_type: q.difficulty_type,
        max_marks: q.max_marks,
        editor_current_saved_code: pg.source_code,
        boilerplate_and_starter_templates: starter_templates,
        sample_test_cases,
        course_scope_guidance,
        student_style_guidelines,
    };

    match CallToolResult::json(&result) {
        Ok(r) => r,
        Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
    }
}

fn strip_html_tags(input: &str) -> String {
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let stripped = re.replace_all(input, "");
    stripped
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&hellip;", "...")
        .trim()
        .to_string()
}
