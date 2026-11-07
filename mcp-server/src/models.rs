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

// ============================================================================
// Assessment / Quiz Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssessmentListResponse {
    #[serde(default)]
    pub count: usize,
    pub next: Option<String>,
    pub previous: Option<String>,
    #[serde(default)]
    pub results: Vec<AssessmentItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssessmentItem {
    pub hash: String,
    pub title: String,
    pub course: Option<LearningUnitCourse>,
    pub start_timestamp: Option<String>,
    pub end_timestamp: Option<String>,
    pub earnable_xp: Option<EarnableXp>,
    pub course_user_assessment_mapping: Option<UserAssessmentMapping>,
    #[serde(default)]
    pub topics: Vec<String>,
    pub total_questions: Option<usize>,
    pub max_marks: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarnableXp {
    #[serde(default)]
    pub is_xp_enabled: bool,
    pub earnable_points: Option<i64>,
    pub earned_points: Option<i64>,
    pub deadline: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAssessmentMapping {
    pub hash: Option<String>,
    #[serde(default)]
    pub completed: bool,
    pub marks: Option<f64>,
    pub total_question_count: Option<usize>,
    pub attempted_question_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssessmentInstructionsResponse {
    #[serde(default)]
    pub honor_code: bool,
    #[serde(default)]
    pub has_acknowledged_honor_code: bool,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizQuestionsResponse {
    pub hash: Option<String>,
    pub title: Option<String>,
    #[serde(default)]
    pub questions: Vec<LiveQuizQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveQuizQuestion {
    pub hash: String,
    pub value: Option<String>,
    pub marked_choice: Option<String>,
    pub input_puzzle_answer: Option<String>,
    pub input_answer: Option<String>,
    pub multiple_choice_question: Option<LiveMcqQuestion>,
    pub question_text: Option<String>,
    pub question_type: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveMcqQuestion {
    pub hash: Option<String>,
    pub id: Option<String>,
    pub question_text: Option<String>,
    pub question_type: Option<i64>,
    #[serde(rename = "choice_A_text", alias = "choice_a_text")]
    pub choice_a_text: Option<String>,
    #[serde(rename = "choice_B_text", alias = "choice_b_text")]
    pub choice_b_text: Option<String>,
    #[serde(rename = "choice_C_text", alias = "choice_c_text")]
    pub choice_c_text: Option<String>,
    #[serde(rename = "choice_D_text", alias = "choice_d_text")]
    pub choice_d_text: Option<String>,
    #[serde(rename = "choice_E_text", alias = "choice_e_text")]
    pub choice_e_text: Option<String>,
    #[serde(rename = "choice_A_image", alias = "choice_a_image")]
    pub choice_a_image: Option<String>,
    #[serde(rename = "choice_B_image", alias = "choice_b_image")]
    pub choice_b_image: Option<String>,
    #[serde(rename = "choice_C_image", alias = "choice_c_image")]
    pub choice_c_image: Option<String>,
    #[serde(rename = "choice_D_image", alias = "choice_d_image")]
    pub choice_d_image: Option<String>,
    #[serde(rename = "choice_E_image", alias = "choice_e_image")]
    pub choice_e_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveQuizQuestionPayload {
    pub hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_answer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_marked_at: Option<i64>,
}

// ============================================================================
// Supabase Quiz Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseQuizRecord {
    pub assessment_hash: String,
    pub course_hash: Option<String>,
    pub title: Option<String>,
    pub total_questions: Option<usize>,
    #[serde(default)]
    pub has_answers_revealed: bool,
    #[serde(default)]
    pub questions: Vec<SupabaseQuestionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseQuestionItem {
    pub marks: Option<f64>,
    #[serde(rename = "mcqHash", alias = "mcq_hash")]
    pub mcq_hash: Option<String>,
    #[serde(rename = "questionHash", alias = "question_hash")]
    pub question_hash: Option<String>,
    #[serde(rename = "questionText", alias = "question_text")]
    pub question_text: Option<String>,
    #[serde(rename = "questionType", alias = "question_type")]
    pub question_type: Option<i64>,
    #[serde(rename = "correctChoice", alias = "correct_choice")]
    pub correct_choice: Option<serde_json::Value>,
    #[serde(rename = "correctChoiceLetter", alias = "correct_choice_letter")]
    pub correct_choice_letter: Option<String>,
    #[serde(rename = "correctPuzzleAnswer", alias = "correct_puzzle_answer")]
    pub correct_puzzle_answer: Option<serde_json::Value>,
    #[serde(rename = "correctExplanation", alias = "correct_explanation")]
    pub correct_explanation: Option<String>,
    #[serde(default)]
    pub options: Vec<SupabaseOptionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseOptionItem {
    pub id: Option<String>,
    pub text: Option<String>,
    pub image: Option<String>,
}

// ============================================================================
// Matching & Answer Resolution Helpers
// ============================================================================

pub fn clean_html_text(raw: &str) -> String {
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let stripped = re.replace_all(raw, " ");
    stripped
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

pub fn find_matching_db_question<'a>(
    active_q: &LiveQuizQuestion,
    db_questions: &'a [SupabaseQuestionItem],
    index: usize,
) -> Option<&'a SupabaseQuestionItem> {
    if db_questions.is_empty() {
        return None;
    }

    let mcq_hash = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.hash.as_deref().or(m.id.as_deref()));

    // 1. Primary match: MCQ internal hash
    if let Some(target_hash) = mcq_hash {
        if let Some(matched) = db_questions.iter().find(|d| {
            d.mcq_hash.as_deref() == Some(target_hash)
                || d.question_hash.as_deref() == Some(target_hash)
        }) {
            return Some(matched);
        }
    }

    // 2. Secondary match: Attempt response mapping hash
    let active_hash = &active_q.hash;
    if !active_hash.is_empty() {
        if let Some(matched) = db_questions.iter().find(|d| {
            d.question_hash.as_deref() == Some(active_hash)
                || d.mcq_hash.as_deref() == Some(active_hash)
        }) {
            return Some(matched);
        }
    }

    // 3. Tertiary match: Cleaned question prompt text
    let active_prompt = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.question_text.as_deref())
        .or(active_q.question_text.as_deref())
        .unwrap_or("");
    let clean_active = clean_html_text(active_prompt);
    if clean_active.len() > 10 {
        if let Some(matched) = db_questions.iter().find(|d| {
            let db_prompt = d.question_text.as_deref().unwrap_or("");
            let clean_db = clean_html_text(db_prompt);
            clean_db.len() > 10 && clean_db == clean_active
        }) {
            return Some(matched);
        }
    }

    // 4. Index-based alignment fallback
    db_questions.get(index)
}

pub fn determine_answer_value(active_q: &LiveQuizQuestion, db_q: &SupabaseQuestionItem) -> String {
    let q_type = active_q
        .multiple_choice_question
        .as_ref()
        .and_then(|m| m.question_type)
        .or(db_q.question_type)
        .unwrap_or(1);

    if q_type == 1 {
        // Multiple Choice Question
        const CHOICE_LETTERS: [&str; 5] = ["A", "B", "C", "D", "E"];
        let mut target_letter = db_q.correct_choice_letter.clone();
        if target_letter.is_none() {
            if let Some(num) = db_q.correct_choice.as_ref().and_then(|v| v.as_i64()) {
                if (1..=5).contains(&num) {
                    target_letter = Some(CHOICE_LETTERS[(num - 1) as usize].to_string());
                }
            }
        }

        // Check for shuffled options by matching option text against active question choices
        if let Some(ref letter) = target_letter {
            let correct_opt_text = db_q
                .options
                .iter()
                .find(|o| o.id.as_deref() == Some(letter))
                .and_then(|o| o.text.as_deref());
            if let (Some(opt_text), Some(mcq)) = (
                correct_opt_text,
                active_q.multiple_choice_question.as_ref(),
            ) {
                let clean_correct = clean_html_text(opt_text);
                if !clean_correct.is_empty() {
                    for choice in CHOICE_LETTERS {
                        let live_text = match choice {
                            "A" => mcq.choice_a_text.as_deref(),
                            "B" => mcq.choice_b_text.as_deref(),
                            "C" => mcq.choice_c_text.as_deref(),
                            "D" => mcq.choice_d_text.as_deref(),
                            "E" => mcq.choice_e_text.as_deref(),
                            _ => None,
                        };
                        if let Some(live) = live_text {
                            if clean_html_text(live) == clean_correct {
                                return choice.to_string();
                            }
                        }
                    }
                }
            }
        }

        return target_letter.unwrap_or_else(|| "A".to_string());
    }

    // Type 2 or 3: Puzzle / Numerical / Fill-in-blanks
    if let Some(ref puzzle) = db_q.correct_puzzle_answer {
        if let Some(s) = puzzle.as_str() {
            return s.to_string();
        }
        return puzzle.to_string();
    }
    if let Some(ref choice) = db_q.correct_choice {
        if let Some(s) = choice.as_str() {
            return s.to_string();
        }
        return choice.to_string();
    }

    "A".to_string()
}
