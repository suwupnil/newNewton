use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_user_coding_style".to_string(),
        description: "Retrieves past submitted code (up to the last 10 solved assignments) to extract the student's authentic coding style, naming conventions, indentation, and structure so new solutions match their established writing pattern.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of past submissions to inspect (default: 10, max: 10).",
                    "default": 10
                },
                "course_hash": {
                    "type": "string",
                    "description": "Optional parent course hash. If omitted, uses the active parent course."
                }
            }
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCodingStyleResult {
    pub total_submissions_analyzed: usize,
    pub primary_language: String,
    pub style_profile: StyleProfile,
    pub submissions: Vec<PastSubmissionSnippet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StyleProfile {
    pub indentation: String,
    pub variable_naming: String,
    pub function_style: String,
    pub comment_frequency: String,
    pub io_pattern: String,
    pub emulation_instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PastSubmissionSnippet {
    pub question_title: String,
    pub language: String,
    pub submitted_code: String,
    pub points_earned: Option<i64>,
}

pub async fn execute(client: &Arc<NewtonClient>, args: Value) -> CallToolResult {
    let limit = args
        .get("limit")
        .and_then(|l| l.as_u64())
        .map(|l| (l as usize).min(10).max(1))
        .unwrap_or(10);

    let parent_hash = match args.get("course_hash").and_then(|h| h.as_str()) {
        Some(h) if !h.trim().is_empty() => h.trim().to_string(),
        _ => match client.get_parent_course_hash().await {
            Ok(h) => h,
            Err(e) => {
                return CallToolResult::error(format!("Failed to get parent course hash: {}", e))
            }
        },
    };

    match get_user_style_internal(client.as_ref(), &parent_hash, limit).await {
        Ok(result) => {
            if result.total_submissions_analyzed == 0 {
                CallToolResult::json(&json!({
                    "total_submissions_analyzed": 0,
                    "message": "No past solved coding submissions found yet for this user. Write clean, readable code with standard beginner conventions.",
                    "primary_language": result.primary_language,
                    "style_profile": result.style_profile,
                    "submissions": result.submissions,
                })).unwrap_or_else(|e| CallToolResult::error(format!("Serialization error: {}", e)))
            } else {
                CallToolResult::json(&result).unwrap_or_else(|e| {
                    CallToolResult::error(format!("Serialization error: {}", e))
                })
            }
        }
        Err(e) => CallToolResult::error(e),
    }
}

pub async fn get_user_style_internal(
    client: &NewtonClient,
    parent_hash: &str,
    limit: usize,
) -> Result<UserCodingStyleResult, String> {
    // Query solved assignments (attempt_statuses = 3)
    let assignments = client
        .get_assignments(parent_hash, "3", 20, 0)
        .await
        .map_err(|e| format!("Failed to fetch solved assignments: {}", e))?;

    let mut collected: Vec<PastSubmissionSnippet> = Vec::new();

    'outer: for assignment in assignments.results {
        let subject_hash = assignment
            .course
            .as_ref()
            .map(|c| c.hash.as_str())
            .unwrap_or(parent_hash);

        for q in assignment.assignment_questions {
            if q.attempt_status == Some(3) {
                // Try fetching playground details
                if let Ok(pg_hash) = client
                    .get_question_playground_hash(subject_hash, &assignment.hash, &q.hash)
                    .await
                {
                    if let Ok(pg) = client.get_playground_details(&pg_hash).await {
                        if let Some(code) = pg.source_code {
                            let trimmed_code = code.trim().to_string();
                            if !trimmed_code.is_empty() {
                                let detected_lang = detect_true_language(
                                    pg.language_text.as_deref(),
                                    &trimmed_code,
                                    &pg.coding_playground_submissions,
                                );

                                collected.push(PastSubmissionSnippet {
                                    question_title: q.question_title.clone(),
                                    language: detected_lang,
                                    submitted_code: trimmed_code,
                                    points_earned: q.earned_points,
                                });

                                if collected.len() >= limit {
                                    break 'outer;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if collected.is_empty() {
        return Ok(UserCodingStyleResult {
            total_submissions_analyzed: 0,
            primary_language: "Python (3.13.1)".to_string(),
            style_profile: StyleProfile {
                indentation: "4 spaces".to_string(),
                variable_naming: "snake_case identifiers".to_string(),
                function_style: "def solve(): entry point under if __name__ == '__main__':".to_string(),
                comment_frequency: "Sparse/Minimal comments (only what was in template)".to_string(),
                io_pattern: "Fast I/O via sys.stdin.read().split()".to_string(),
                emulation_instructions: "Emulate standard beginner conventions: 4 spaces indent, snake_case naming, fast I/O, minimal comments.".to_string(),
            },
            submissions: vec![],
        });
    }

    // Analyze style heuristics dynamically from collected snippets
    let mut indent_4_spaces = 0;
    let mut indent_2_spaces = 0;
    let mut indent_tabs = 0;
    let mut comment_lines = 0;
    let mut total_lines = 0;
    let mut uses_sys_stdin = false;
    let mut uses_input_split = false;
    let mut uses_scanner = false;
    let mut single_letter_vars = 0;
    let mut snake_case_vars = 0;
    let mut camel_case_vars = 0;
    let mut flat_script_count = 0;
    let mut helper_func_count = 0;
    let mut main_block_count = 0;
    let mut lang_counts: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();

    let snake_re = regex::Regex::new(r"\b[a-z]+_[a-z0-9_]+\b").unwrap();
    let camel_re = regex::Regex::new(r"\b[a-z]+[A-Z][a-zA-Z0-9]*\b").unwrap();
    let single_re = regex::Regex::new(r"\b[a-z]\s*=").unwrap();

    for sub in &collected {
        *lang_counts.entry(sub.language.clone()).or_default() += 1;
        let mut has_func = false;
        let mut has_main = false;

        for line in sub.submitted_code.lines() {
            total_lines += 1;
            let trimmed = line.trim_start();

            // Ignore boilerplate starter comments
            let is_boilerplate_comment = trimmed.starts_with("# TODO:")
                || trimmed.starts_with("# Your code here")
                || trimmed.starts_with("// Your code here")
                || trimmed.starts_with("// don't change")
                || trimmed.starts_with("// contains");

            if !is_boilerplate_comment && (trimmed.starts_with('#') || trimmed.starts_with("//")) {
                comment_lines += 1;
            }

            if line.starts_with("    ") {
                indent_4_spaces += 1;
            } else if line.starts_with("  ") {
                indent_2_spaces += 1;
            } else if line.starts_with('\t') {
                indent_tabs += 1;
            }

            if line.contains("sys.stdin") {
                uses_sys_stdin = true;
            }
            if line.contains("input().split()") || line.contains(".split()") {
                uses_input_split = true;
            }
            if line.contains("Scanner(") {
                uses_scanner = true;
            }

            if line.contains("def ")
                || line.contains("void ")
                || line.contains("int ") && line.contains('(')
            {
                has_func = true;
            }
            if line.contains("__name__ == '__main__'") || line.contains("main(String[] args)") {
                has_main = true;
            }

            single_letter_vars += single_re.find_iter(line).count();
            snake_case_vars += snake_re.find_iter(line).count();
            camel_case_vars += camel_re.find_iter(line).count();
        }

        if has_main {
            main_block_count += 1;
        } else if has_func {
            helper_func_count += 1;
        } else {
            flat_script_count += 1;
        }
    }

    let primary_lang = lang_counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(lang, _)| lang)
        .unwrap_or_else(|| "Python".to_string());

    let indentation = if indent_tabs > indent_4_spaces && indent_tabs > indent_2_spaces {
        "Tabs".to_string()
    } else if indent_2_spaces > indent_4_spaces {
        "2 spaces".to_string()
    } else {
        "4 spaces".to_string()
    };

    let comment_frequency = if total_lines > 0 && (comment_lines * 100 / total_lines) > 8 {
        "Moderate/Frequent comments".to_string()
    } else {
        "Sparse/Minimal comments (only what was in template)".to_string()
    };

    let io_pattern = if uses_sys_stdin {
        "Fast I/O via sys.stdin.read().split()".to_string()
    } else if uses_scanner {
        "Java Scanner(System.in)".to_string()
    } else if uses_input_split {
        "Standard Python input().split() and print() statements".to_string()
    } else {
        "Standard input()/print() statements".to_string()
    };

    let variable_naming = if single_letter_vars > (snake_case_vars + camel_case_vars) {
        "Concise single-letter variables (e.g. n, x, i, j, a, b) with occasional helper identifiers"
            .to_string()
    } else if camel_case_vars > snake_case_vars {
        "camelCase identifiers".to_string()
    } else {
        "snake_case identifiers".to_string()
    };

    let function_style = if main_block_count >= collected.len() / 2 {
        "Entry point pattern using def solve(): under if __name__ == '__main__':".to_string()
    } else if helper_func_count >= flat_script_count {
        "Standalone modular helper functions called directly from script level".to_string()
    } else {
        "Flat sequential script without wrapper functions, executing directly at module level"
            .to_string()
    };

    let profile = StyleProfile {
        indentation,
        variable_naming,
        function_style,
        comment_frequency,
        io_pattern,
        emulation_instructions: "Emulate the student's authentic coding habits: adopt their indentation spacing, matching comments density, variable naming concise style, and I/O patterns shown in the past submission samples.".to_string(),
    };

    Ok(UserCodingStyleResult {
        total_submissions_analyzed: collected.len(),
        primary_language: primary_lang,
        style_profile: profile,
        submissions: collected,
    })
}

fn detect_true_language(
    raw_lang: Option<&str>,
    code: &str,
    submissions: &[crate::models::PlaygroundSubmissionSummary],
) -> String {
    // 1. Check if any passing submission explicitly specified language
    for sub in submissions {
        if sub.all_test_cases_passing == Some(true) || sub.current_status == Some(3) {
            if let Some(text) = &sub.language_text {
                if !text.trim().is_empty() {
                    return text.clone();
                }
            }
        }
    }

    // 2. Syntax-based heuristic checks
    if code.contains("import java.")
        || code.contains("class Main")
        || code.contains("public static void main")
        || code.contains("System.out.")
    {
        return "Java (OpenJDK 21)".to_string();
    }
    if code.contains("#include")
        || code.contains("std::")
        || code.contains("int main(")
        || code.contains("cout <<")
    {
        return "C++ (GCC 9.2.0)".to_string();
    }
    if code.contains("def ")
        || code.contains("import sys")
        || code.contains("input()")
        || code.contains("print(")
    {
        return "Python (3.13.1)".to_string();
    }

    raw_lang.unwrap_or("Python (3.13.1)").to_string()
}
