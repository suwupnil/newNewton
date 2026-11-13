pub mod clear_selection;
pub mod course_scope;
pub mod decide_language;
pub mod pending_assignments;
pub mod pending_quizzes;
pub mod problem_details;
pub mod quiz_questions;
pub mod run_code;
pub mod save_quiz_answer;
pub mod submit_quiz;
pub mod submit_solution;
pub mod telemetry_control;
pub mod user_info;
pub mod user_style;

use serde_json::Value;
use std::sync::Arc;

use crate::api::{JevClient, Judge0Client, NewtonClient, SupabaseClient, TelemetryClient};
use crate::mcp::protocol::{CallToolResult, Tool};

pub fn list_tools() -> Vec<Tool> {
    vec![
        course_scope::tool_definition(),
        user_style::tool_definition(),
        run_code::tool_definition(),
        submit_solution::tool_definition(),
        pending_assignments::tool_definition(),
        decide_language::tool_definition(),
        problem_details::tool_definition(),
        telemetry_control::save_code_tool_definition(),
        telemetry_control::configure_tool_definition(),
        pending_quizzes::tool_definition(),
        quiz_questions::tool_definition(),
        save_quiz_answer::tool_definition(),
        clear_selection::tool_definition(),
        submit_quiz::tool_definition(),
        user_info::tool_definition(),
    ]
}

pub async fn call_tool(
    name: &str,
    args: Value,
    newton_client: &Arc<NewtonClient>,
    judge0_client: &Arc<Judge0Client>,
    jev_client: &Arc<JevClient>,
    telemetry_client: &Arc<TelemetryClient>,
    supabase_client: &Arc<SupabaseClient>,
) -> CallToolResult {
    match name {
        "get_course_scope" => course_scope::execute(newton_client, args).await,
        "get_user_coding_style" => user_style::execute(newton_client, args).await,
        "run_playground_code" => run_code::execute(newton_client, judge0_client, args).await,
        "submit_assignment_solution" => {
            submit_solution::execute(newton_client, telemetry_client, args).await
        }
        "get_pending_assignments" | "list_assignments" => {
            pending_assignments::execute(newton_client, args).await
        }
        "decide_strategy_and_language" | "decide_strategy" => {
            decide_language::execute(newton_client, jev_client, args).await
        }
        "get_problem_details" | "get_problem" => {
            problem_details::execute(newton_client, args).await
        }
        "save_editor_code" => {
            telemetry_control::execute_save(newton_client, telemetry_client, args).await
        }
        "configure_telemetry" => telemetry_control::execute_configure(telemetry_client, args).await,
        "get_pending_quizzes" | "list_quizzes" => {
            pending_quizzes::execute(newton_client, supabase_client, args).await
        }
        "get_quiz_questions" | "get_assessment_questions" => {
            quiz_questions::execute(newton_client, supabase_client, args).await
        }
        "save_quiz_answer" | "save_assessment_answer" => {
            save_quiz_answer::execute(newton_client, args).await
        }
        "clear_selection" | "clear_quiz_selection" | "clear_answer" => {
            clear_selection::execute(newton_client, args).await
        }
        "submit_quiz_answers" | "save_quiz_answers" => {
            submit_quiz::execute(newton_client, args).await
        }
        "get_user_info" | "get_user_profile" | "user_info" => {
            user_info::execute(newton_client, args).await
        }
        unknown => CallToolResult::error(format!("Unknown tool: {}", unknown)),
    }
}
