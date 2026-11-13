use anyhow::{anyhow, Result};
use reqwest::header::{
    HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT,
};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::Config;
use crate::models::*;

#[derive(Clone)]
pub struct NewtonClient {
    client: reqwest::Client,
    config: Arc<Config>,
    cached_parent_course_hash: Arc<RwLock<Option<String>>>,
    cached_username: Arc<RwLock<Option<String>>>,
    cached_assignment_courses: Arc<RwLock<std::collections::HashMap<String, String>>>,
    cached_assessment_courses: Arc<RwLock<std::collections::HashMap<String, String>>>,
}

#[allow(dead_code)]
impl NewtonClient {
    pub fn new(config: Arc<Config>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", config.auth_token))
                .map_err(|e| anyhow!("Invalid auth token header: {}", e))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&config.user_agent)
                .map_err(|e| anyhow!("Invalid user agent header: {}", e))?,
        );
        headers.insert(
            ORIGIN,
            HeaderValue::from_static("https://my.newtonschool.co"),
        );
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://my.newtonschool.co/"),
        );

        if let Some(ref secret) = config.proxy_secret {
            if let Ok(val) = HeaderValue::from_str(secret) {
                headers.insert(HeaderName::from_static("x-proxy-secret"), val);
            }
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        let initial_course = config.parent_course_hash.clone();

        Ok(Self {
            client,
            config,
            cached_parent_course_hash: Arc::new(RwLock::new(initial_course)),
            cached_username: Arc::new(RwLock::new(None)),
            cached_assignment_courses: Arc::new(RwLock::new(std::collections::HashMap::new())),
            cached_assessment_courses: Arc::new(RwLock::new(std::collections::HashMap::new())),
        })
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    pub async fn get_user_profile(&self) -> Result<UserProfile> {
        let url = format!("{}/api/v1/user/me/", self.config.lms_base_url);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch user profile: HTTP {}",
                resp.status()
            ));
        }
        let profile: UserProfile = resp.json().await?;
        let mut user_lock = self.cached_username.write().await;
        *user_lock = Some(profile.username.clone());
        Ok(profile)
    }

    pub async fn get_username(&self) -> Result<String> {
        {
            let lock = self.cached_username.read().await;
            if let Some(username) = lock.as_ref() {
                return Ok(username.clone());
            }
        }
        let profile = self.get_user_profile().await?;
        Ok(profile.username)
    }

    pub async fn get_parent_course_hash(&self) -> Result<String> {
        {
            let lock = self.cached_parent_course_hash.read().await;
            if let Some(hash) = lock.as_ref() {
                return Ok(hash.clone());
            }
        }

        let url = format!(
            "{}/api/v2/course/all/applied/?pagination=false&completed=false",
            self.config.lms_base_url
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch applied courses: HTTP {}",
                resp.status()
            ));
        }
        let courses: Vec<AppliedCourse> = resp.json().await?;

        // Prioritize parent admin unit courses where user is enrolled
        for course in &courses {
            if let Some(children) = &course.children_courses {
                if children.is_parent_admin_unit_course {
                    let mut lock = self.cached_parent_course_hash.write().await;
                    *lock = Some(course.hash.clone());
                    return Ok(course.hash.clone());
                }
            }
        }

        // Fallback to first course if no admin course explicitly marked
        if let Some(first) = courses.first() {
            let mut lock = self.cached_parent_course_hash.write().await;
            *lock = Some(first.hash.clone());
            return Ok(first.hash.clone());
        }

        Err(anyhow!("No active Newton School courses found for user"))
    }

    pub async fn get_applied_courses(&self) -> Result<Vec<AppliedCourse>> {
        let url = format!(
            "{}/api/v2/course/all/applied/?pagination=false&completed=false",
            self.config.lms_base_url
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch applied courses: HTTP {}",
                resp.status()
            ));
        }
        let courses: Vec<AppliedCourse> = resp.json().await?;
        Ok(courses)
    }

    pub async fn get_course_details(&self, course_hash: &str) -> Result<Value> {
        let url = format!(
            "{}/api/v1/course/h/{}/details/",
            self.config.lms_base_url, course_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch course details for {}: HTTP {}",
                course_hash,
                resp.status()
            ));
        }
        let json: Value = resp.json().await?;
        Ok(json)
    }

    pub async fn get_learning_courses(&self, course_hash: &str) -> Result<Vec<LearningUnitCourse>> {
        let url = format!(
            "{}/api/v2/course/h/{}/learning_course/all/?pagination=false",
            self.config.lms_base_url, course_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch learning courses for {}: HTTP {}",
                course_hash,
                resp.status()
            ));
        }
        let courses: Vec<LearningUnitCourse> = resp.json().await?;
        Ok(courses)
    }

    pub async fn get_lectures(&self, course_hash: &str) -> Result<Vec<LectureItem>> {
        let url = format!(
            "{}/api/v2/course/h/{}/lecture/all/?pagination=false",
            self.config.lms_base_url, course_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch lectures for {}: HTTP {}",
                course_hash,
                resp.status()
            ));
        }
        let lectures: Vec<LectureItem> = resp.json().await?;
        Ok(lectures)
    }

    pub async fn get_assignments(
        &self,
        course_hash: &str,
        attempt_statuses: &str,
        limit: usize,
        offset: usize,
    ) -> Result<AssignmentListResponse> {
        let mut url = format!(
            "{}/api/v2/course/h/{}/assignment/all/?limit={}&offset={}",
            self.config.lms_base_url, course_hash, limit, offset
        );
        if !attempt_statuses.is_empty() {
            url.push_str(&format!("&attempt_statuses={}", attempt_statuses));
        }

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch assignments for {}: HTTP {}",
                course_hash,
                resp.status()
            ));
        }
        let list: AssignmentListResponse = resp.json().await?;
        {
            let mut cache = self.cached_assignment_courses.write().await;
            for item in &list.results {
                if let Some(sub) = &item.course {
                    cache.insert(item.hash.clone(), sub.hash.clone());
                }
            }
        }
        Ok(list)
    }

    pub async fn get_question_playground_hash(
        &self,
        course_hash: &str,
        assignment_hash: &str,
        question_hash: &str,
    ) -> Result<String> {
        // 1. Direct check with passed course_hash
        let url = format!(
            "{}/api/v1/course/h/{}/assignment/h/{}/question/h/{}/details/",
            self.config.lms_base_url, course_hash, assignment_hash, question_hash
        );
        let resp = self.client.get(&url).send().await?;

        if resp.status().is_success() {
            let details: QuestionDetailsResponse = resp.json().await?;
            return Ok(details.hash);
        }

        // 2. Check cached assignment course mapping
        {
            let cache = self.cached_assignment_courses.read().await;
            if let Some(sub_course) = cache.get(assignment_hash) {
                let sub_url = format!(
                    "{}/api/v1/course/h/{}/assignment/h/{}/question/h/{}/details/",
                    self.config.lms_base_url, sub_course, assignment_hash, question_hash
                );
                if let Ok(sub_resp) = self.client.get(&sub_url).send().await {
                    if sub_resp.status().is_success() {
                        let details: QuestionDetailsResponse = sub_resp.json().await?;
                        return Ok(details.hash);
                    }
                }
            }
        }

        // 3. If parent course hash returned 404, look up the assignment to find its specific subject course hash
        if let Ok(assignments) = self.get_assignments(course_hash, "", 100, 0).await {
            for item in assignments.results {
                if item.hash == assignment_hash {
                    if let Some(sub_course) = item.course {
                        let sub_url = format!(
                            "{}/api/v1/course/h/{}/assignment/h/{}/question/h/{}/details/",
                            self.config.lms_base_url,
                            sub_course.hash,
                            assignment_hash,
                            question_hash
                        );
                        let sub_resp = self.client.get(&sub_url).send().await?;
                        if sub_resp.status().is_success() {
                            let details: QuestionDetailsResponse = sub_resp.json().await?;
                            return Ok(details.hash);
                        }
                    }
                }
            }
        }

        // 4. Fallback: probe enrolled learning courses
        if let Ok(learning_courses) = self.get_learning_courses(course_hash).await {
            for sub in learning_courses {
                let sub_url = format!(
                    "{}/api/v1/course/h/{}/assignment/h/{}/question/h/{}/details/",
                    self.config.lms_base_url, sub.hash, assignment_hash, question_hash
                );
                if let Ok(sub_resp) = self.client.get(&sub_url).send().await {
                    if sub_resp.status().is_success() {
                        let mut cache = self.cached_assignment_courses.write().await;
                        cache.insert(assignment_hash.to_string(), sub.hash.clone());
                        let details: QuestionDetailsResponse = sub_resp.json().await?;
                        return Ok(details.hash);
                    }
                }
            }
        }

        Err(anyhow!(
            "Question details not found for assignment: {}, question: {}",
            assignment_hash,
            question_hash
        ))
    }

    pub async fn get_playground_details(&self, playground_hash: &str) -> Result<CodingPlayground> {
        let url = format!(
            "{}/api/v1/playground/coding/h/{}/",
            self.config.lms_base_url, playground_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch playground {}: HTTP {}",
                playground_hash,
                resp.status()
            ));
        }
        let pg: CodingPlayground = resp.json().await?;
        Ok(pg)
    }

    pub async fn get_playground_submissions(
        &self,
        playground_hash: &str,
    ) -> Result<CodingPlayground> {
        let url = format!(
            "{}/api/v1/playground/coding/h/{}/submission/",
            self.config.lms_base_url, playground_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch playground submissions {}: HTTP {}",
                playground_hash,
                resp.status()
            ));
        }
        let pg: CodingPlayground = resp.json().await?;
        Ok(pg)
    }

    pub async fn save_playground_code(
        &self,
        playground_hash: &str,
        source_code: &str,
        language_id: i64,
        run_hidden: bool,
    ) -> Result<Value> {
        let url = format!(
            "{}/api/v1/playground/coding/h/{}/?run_hidden_test_cases={}",
            self.config.lms_base_url, playground_hash, run_hidden
        );

        let now_ms = chrono::Utc::now().timestamp_millis();
        let payload = PlaygroundSavePayload {
            hash: playground_hash.to_string(),
            source_code: source_code.to_string(),
            language_id,
            run_hidden_test: run_hidden,
            is_force_save: true,
            standard_input: Some("".to_string()),
            showSubmissionTab: run_hidden,
            autoSave: !run_hidden,
            last_saved_at: Some(now_ms),
        };

        let resp = self.client.patch(&url).json(&payload).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to save/submit code to playground {}: HTTP {} - {}",
                playground_hash,
                status,
                body
            ));
        }

        let res_json: Value = resp
            .json()
            .await
            .unwrap_or(serde_json::json!({"status": "saved"}));
        Ok(res_json)
    }

    pub async fn get_latest_submission(
        &self,
        playground_hash: &str,
    ) -> Result<LatestSubmissionResponse> {
        let username = self.get_username().await?;
        let url = format!(
            "{}/api/v1/playground/coding/h/{}/latest_submission/?username={}",
            self.config.lms_base_url, playground_hash, username
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch latest submission: HTTP {}",
                resp.status()
            ));
        }
        let submission: LatestSubmissionResponse = resp.json().await?;
        Ok(submission)
    }

    pub async fn get_assessments(&self, course_hash: &str) -> Result<Vec<AssessmentItem>> {
        let url = format!(
            "{}/api/v2/course/h/{}/assessment/all/?pagination=false",
            self.config.lms_base_url, course_hash
        );
        let resp = self.client.get(&url).send().await?;

        let items: Vec<AssessmentItem> = if resp.status().is_success() {
            let data: Value = resp.json().await?;
            if let Some(arr) = data.as_array() {
                serde_json::from_value(Value::Array(arr.clone())).unwrap_or_default()
            } else if let Some(results) = data.get("results").and_then(|r| r.as_array()) {
                serde_json::from_value(Value::Array(results.clone())).unwrap_or_default()
            } else {
                Vec::new()
            }
        } else {
            // Fallback to paginated endpoint
            let paged_url = format!(
                "{}/api/v2/course/h/{}/assessment/all/?limit=100&offset=0",
                self.config.lms_base_url, course_hash
            );
            let paged_resp = self.client.get(&paged_url).send().await?;
            if !paged_resp.status().is_success() {
                return Err(anyhow!(
                    "Failed to fetch assessments for {}: HTTP {}",
                    course_hash,
                    paged_resp.status()
                ));
            }
            let list: AssessmentListResponse = paged_resp.json().await?;
            list.results
        };

        // Cache child course associations for fast lookup
        {
            let mut cache = self.cached_assessment_courses.write().await;
            for item in &items {
                if let Some(sub) = &item.course {
                    cache.insert(item.hash.clone(), sub.hash.clone());
                } else {
                    cache.insert(item.hash.clone(), course_hash.to_string());
                }
            }
        }

        Ok(items)
    }

    pub async fn get_assessment_instructions(
        &self,
        course_hash: &str,
        assessment_hash: &str,
    ) -> Result<AssessmentInstructionsResponse> {
        let url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/instructions/",
            self.config.lms_base_url, course_hash, assessment_hash
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to fetch instructions for assessment {}: HTTP {}",
                assessment_hash,
                resp.status()
            ));
        }
        let instr: AssessmentInstructionsResponse = resp.json().await?;
        Ok(instr)
    }

    pub async fn acknowledge_honor_code(
        &self,
        course_hash: &str,
        assessment_hash: &str,
    ) -> Result<()> {
        let url = format!(
            "{}/api/v1/integrated_assessments/{}/h/{}/honor_code/",
            self.config.lms_base_url, course_hash, assessment_hash
        );
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({ "acknowledged": true }))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!(
                "Failed to acknowledge honor code for assessment {}: HTTP {}",
                assessment_hash,
                resp.status()
            ));
        }
        Ok(())
    }

    pub async fn get_quiz_session(
        &self,
        course_hash: &str,
        assessment_hash: &str,
    ) -> Result<QuizQuestionsResponse> {
        // Step 1: Check instructions and acknowledge honor code if needed
        if let Ok(instr) = self.get_assessment_instructions(course_hash, assessment_hash).await {
            if instr.honor_code && !instr.has_acknowledged_honor_code {
                let _ = self.acknowledge_honor_code(course_hash, assessment_hash).await;
            }
        }

        // Step 2: Try starting a new attempt
        let new_attempt_url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/questions/?new_attempt=true",
            self.config.lms_base_url, course_hash, assessment_hash
        );

        if let Ok(resp) = self.client.get(&new_attempt_url).send().await {
            if resp.status().is_success() {
                if let Ok(session) = resp.json::<QuizQuestionsResponse>().await {
                    if !session.questions.is_empty() {
                        return Ok(session);
                    }
                }
            }
        }

        // Step 3: Resume existing attempt session
        let resume_url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/questions/",
            self.config.lms_base_url, course_hash, assessment_hash
        );
        let resume_resp = self.client.get(&resume_url).send().await?;
        if !resume_resp.status().is_success() {
            return Err(anyhow!(
                "Failed to access quiz session for assessment {}: HTTP {}",
                assessment_hash,
                resume_resp.status()
            ));
        }

        let session: QuizQuestionsResponse = resume_resp.json().await?;
        Ok(session)
    }

    pub async fn save_quiz_question(
        &self,
        course_hash: &str,
        assessment_hash: &str,
        question_hash: &str,
        value: Option<&str>,
        input_answer: Option<&str>,
        client_marked_at: Option<i64>,
    ) -> Result<Value> {
        let url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/question/",
            self.config.lms_base_url, course_hash, assessment_hash
        );

        let marked_at = client_marked_at.unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
        let payload = SaveQuizQuestionPayload {
            hash: question_hash.to_string(),
            value: value.map(|s| s.to_string()),
            input_answer: input_answer.map(|s| s.to_string()),
            client_marked_at: Some(marked_at),
        };

        let resp = self.client.post(&url).json(&payload).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to save quiz question {}: HTTP {} - {}",
                question_hash,
                status,
                body
            ));
        }

        let result: Value = resp
            .json()
            .await
            .unwrap_or(serde_json::json!({ "status": "saved" }));
        Ok(result)
    }

    pub async fn clear_quiz_question(
        &self,
        course_hash: &str,
        assessment_hash: &str,
        question_hash: &str,
    ) -> Result<Value> {
        let url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/question/",
            self.config.lms_base_url, course_hash, assessment_hash
        );

        let marked_at = chrono::Utc::now().timestamp_millis();
        let payload = serde_json::json!({
            "hash": question_hash,
            "value": serde_json::Value::Null,
            "input_answer": serde_json::Value::Null,
            "client_marked_at": marked_at
        });

        let resp = self.client.post(&url).json(&payload).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to clear quiz question {}: HTTP {} - {}",
                question_hash,
                status,
                body
            ));
        }

        let result: Value = resp
            .json()
            .await
            .unwrap_or(serde_json::json!({ "status": "cleared" }));
        Ok(result)
    }

    pub async fn finalize_quiz(
        &self,
        course_hash: &str,
        assessment_hash: &str,
    ) -> Result<Value> {
        let url = format!(
            "{}/api/v1/course/h/{}/assessment/h/{}/questions/?auto_submit=false",
            self.config.lms_base_url, course_hash, assessment_hash
        );

        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({}))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to finalize quiz assessment {}: HTTP {} - {}",
                assessment_hash,
                status,
                body
            ));
        }

        let result: Value = resp
            .json()
            .await
            .unwrap_or(serde_json::json!({ "status": "submitted" }));
        Ok(result)
    }

    pub async fn resolve_assessment_course_hash(
        &self,
        course_hash: &str,
        assessment_hash: &str,
    ) -> Result<String> {
        // 1. Direct check in cached assessment mappings
        {
            let cache = self.cached_assessment_courses.read().await;
            if let Some(sub) = cache.get(assessment_hash) {
                return Ok(sub.clone());
            }
        }

        // 2. Query assessments for current course container to populate cache
        if let Ok(assessments) = self.get_assessments(course_hash).await {
            for a in assessments {
                if a.hash == assessment_hash {
                    if let Some(sub) = a.course {
                        return Ok(sub.hash);
                    }
                    return Ok(course_hash.to_string());
                }
            }
        }

        // 3. Fallback: probe learning courses
        if let Ok(learning_courses) = self.get_learning_courses(course_hash).await {
            for sub in learning_courses {
                if let Ok(sub_assessments) = self.get_assessments(&sub.hash).await {
                    for a in sub_assessments {
                        if a.hash == assessment_hash {
                            let mut cache = self.cached_assessment_courses.write().await;
                            cache.insert(assessment_hash.to_string(), sub.hash.clone());
                            return Ok(sub.hash);
                        }
                    }
                }
            }
        }

        // Default to passed course hash
        Ok(course_hash.to_string())
    }
}
