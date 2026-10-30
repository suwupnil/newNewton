use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub username: String,
    pub uid: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedCourse {
    pub hash: String,
    pub title: String,
    pub unit_type: Option<String>,
    pub user_status: Option<i64>,
    pub user_status_text: Option<String>,
    pub children_courses: Option<ChildrenCoursesContainer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChildrenCoursesContainer {
    #[serde(default)]
    pub is_parent_admin_unit_course: bool,
    #[serde(default)]
    pub admin_unit_courses: Vec<AdminUnitCourse>,
    #[serde(default)]
    pub learning_unit_courses: Vec<LearningUnitCourse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUnitCourse {
    pub hash: String,
    pub title: String,
    pub short_display_name: Option<String>,
    #[serde(default)]
    pub is_active_admin_unit_course: bool,
    #[serde(default)]
    pub learning_unit_courses: Vec<LearningUnitCourse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearningUnitCourse {
    pub hash: String,
    pub title: String,
    pub short_display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LectureItem {
    pub hash: String,
    pub title: String,
    pub start_timestamp: Option<String>,
    pub end_timestamp: Option<String>,
    pub attended: Option<bool>,
    pub course: Option<LearningUnitCourse>,
    #[serde(default)]
    pub topics: Vec<LectureTopic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LectureTopic {
    pub title: String,
    pub slug: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentListResponse {
    pub count: usize,
    pub next: Option<String>,
    pub previous: Option<String>,
    #[serde(default)]
    pub results: Vec<AssignmentItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentItem {
    pub hash: String,
    pub title: String,
    pub course: Option<LearningUnitCourse>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    #[serde(default)]
    pub assignment_questions: Vec<AssignmentQuestionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentQuestionSummary {
    pub hash: String,
    pub question_title: String,
    pub difficulty_type: Option<i64>,
    #[serde(default)]
    pub topics: Vec<String>,
    pub attempt_status: Option<i64>,
    pub earned_points: Option<i64>,
    pub earnable_points: Option<i64>,
    pub earned_at: Option<String>,
    pub deadline: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionDetailsResponse {
    pub hash: String,
    #[serde(rename = "type")]
    pub question_type: Option<String>,
    pub sub_type: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingPlayground {
    pub hash: String,
    pub title: Option<String>,
    pub language_id: Option<i64>,
    pub language_text: Option<String>,
    pub last_saved_at: Option<i64>,
    pub source_code: Option<String>,
    pub standard_input: Option<String>,
    pub scratchpad_content: Option<String>,
    pub assignment_question: Option<AssignmentQuestionDetail>,
    #[serde(default)]
    pub coding_playground_submissions: Vec<PlaygroundSubmissionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaygroundSubmissionSummary {
    pub hash: String,
    pub all_test_cases_passing: Option<bool>,
    pub wrong_submission: Option<bool>,
    pub current_status: Option<i64>,
    pub compilation_error: Option<bool>,
    pub number_of_test_cases_passing: Option<usize>,
    pub created_at: Option<i64>,
    pub language_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentQuestionDetail {
    pub hash: String,
    pub question_title: String,
    pub question_text: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub example: Option<String>,
    pub constraints: Option<String>,
    pub difficulty_type: Option<i64>,
    pub max_marks: Option<i64>,
    #[serde(default)]
    pub assignment_question_language_mappings: Vec<LanguageMapping>,
    #[serde(default)]
    pub assignment_question_test_case_mappings: Vec<TestCaseMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageMapping {
    pub hash: Option<String>,
    pub language_id: i64,
    pub language_text: String,
    pub cpu_time_limit: Option<f64>,
    pub memory_limit: Option<i64>,
    pub pre_function_code: Option<String>,
    pub function_code: Option<String>,
    pub post_function_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCaseMapping {
    pub hash: String,
    pub title: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Judge0SubmissionPayload {
    pub language_id: i64,
    pub source_code: String,
    pub playground_hash: String,
    pub stdin: String,
    pub cpu_time_limit: Option<f64>,
    pub memory_limit: Option<i64>,
    pub compiler_options: Option<String>,
    #[serde(default)]
    pub enable_network: bool,
    #[serde(default)]
    pub max_processes_and_or_threads: Option<i64>,
    #[serde(default)]
    pub number_of_runs: Option<i64>,
    #[serde(default)]
    pub cpu_extra_time: Option<f64>,
    #[serde(default)]
    pub wall_time_limit: Option<f64>,
    #[serde(default)]
    pub stack_limit: Option<i64>,
    #[serde(default)]
    pub pre_function_code: String,
    #[serde(default)]
    pub function_code: String,
    #[serde(default)]
    pub post_function_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Judge0CreateResponse {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Judge0PollResponse {
    pub token: String,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub message: Option<String>,
    pub time: Option<String>,
    pub memory: Option<i64>,
    pub status: Judge0Status,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Judge0Status {
    pub id: i64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct PlaygroundSavePayload {
    pub hash: String,
    pub source_code: String,
    pub language_id: i64,
    pub run_hidden_test: bool,
    pub is_force_save: bool,
    pub standard_input: Option<String>,
    #[serde(default)]
    pub showSubmissionTab: bool,
    #[serde(default)]
    pub autoSave: bool,
    pub last_saved_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestSubmissionResponse {
    pub hash: Option<String>,
    #[serde(default)]
    pub wrong_submission: bool,
    #[serde(default)]
    pub number_of_test_cases_passing: usize,
    pub current_status: Option<i64>,
    #[serde(default)]
    pub submission_test_case_mappings: Vec<SubmissionTestCaseResult>,
    pub submission_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionTestCaseResult {
    pub status: i64,
    pub status_text: Option<String>,
    pub time: Option<f64>,
    pub memory: Option<i64>,
    pub assignment_question_test_case_mapping: Option<TestCaseMappingSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCaseMappingSummary {
    pub hash: Option<String>,
    pub title: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    #[serde(default)]
    pub hidden: bool,
}
