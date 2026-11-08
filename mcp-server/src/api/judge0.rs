use anyhow::{anyhow, Result};
use base64::prelude::*;
use reqwest::header::{
    HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

use crate::config::Config;
use crate::models::{Judge0CreateResponse, Judge0PollResponse, Judge0SubmissionPayload};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub status_id: i64,
    pub status_description: String,
    pub is_accepted: bool,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub compile_output: Option<String>,
    pub execution_time: Option<String>,
    pub memory_used_kb: Option<i64>,
    pub message: Option<String>,
}

#[derive(Clone)]
pub struct Judge0Client {
    client: reqwest::Client,
    config: Arc<Config>,
}

impl Judge0Client {
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
            HeaderValue::from_static("https://judge0-public.newtonschool.co"),
        );
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://judge0-public.newtonschool.co/"),
        );

        if let Some(ref secret) = config.proxy_secret {
            if let Ok(val) = HeaderValue::from_str(secret) {
                headers.insert(HeaderName::from_static("x-proxy-secret"), val);
            }
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self { client, config })
    }

    pub async fn execute_code(
        &self,
        playground_hash: &str,
        source_code: &str,
        language_id: i64,
        stdin: &str,
        cpu_time_limit: Option<f64>,
        memory_limit: Option<i64>,
        pre_function_code: Option<&str>,
        function_code: Option<&str>,
        post_function_code: Option<&str>,
    ) -> Result<ExecutionResult> {
        let encoded_source = BASE64_STANDARD.encode(source_code.as_bytes());
        let encoded_stdin = BASE64_STANDARD.encode(stdin.as_bytes());

        let payload = Judge0SubmissionPayload {
            language_id,
            source_code: encoded_source,
            playground_hash: playground_hash.to_string(),
            stdin: encoded_stdin,
            cpu_time_limit: cpu_time_limit.or(Some(2.0)),
            memory_limit: memory_limit.or(Some(256000)),
            compiler_options: None,
            enable_network: false,
            max_processes_and_or_threads: Some(60),
            number_of_runs: Some(1),
            cpu_extra_time: Some(2.0),
            wall_time_limit: Some(6.0),
            stack_limit: Some(64000),
            pre_function_code: pre_function_code.unwrap_or("").to_string(),
            function_code: function_code.unwrap_or("").to_string(),
            post_function_code: post_function_code.unwrap_or("").to_string(),
        };

        let submit_url = format!(
            "{}/submissions/?base64_encoded=true&wait=false",
            self.config.judge0_base_url
        );

        let resp = self.client.post(&submit_url).json(&payload).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to submit to Judge0: HTTP {} - {}",
                status,
                body
            ));
        }

        let create_res: Judge0CreateResponse = resp.json().await?;
        let token = create_res.token;

        // Poll execution result
        let poll_url = format!(
            "{}/submissions/{}/?base64_encoded=true&wait=false",
            self.config.judge0_base_url, token
        );

        let max_polls = 30; // 15 seconds max (30 * 500ms)
        for _ in 0..max_polls {
            tokio::time::sleep(Duration::from_millis(500)).await;

            let poll_resp = self.client.get(&poll_url).send().await?;
            if !poll_resp.status().is_success() {
                continue;
            }

            let poll_data: Judge0PollResponse = poll_resp.json().await?;
            let status_id = poll_data.status.id;

            // Status 1: In Queue, 2: Processing
            if status_id != 1 && status_id != 2 {
                let stdout = poll_data.stdout.and_then(|s| Self::decode_b64(&s));
                let stderr = poll_data.stderr.and_then(|s| Self::decode_b64(&s));
                let compile_output = poll_data.compile_output.and_then(|s| Self::decode_b64(&s));
                let message = poll_data.message.and_then(|s| Self::decode_b64(&s));

                let is_accepted = status_id == 3;

                return Ok(ExecutionResult {
                    status_id,
                    status_description: poll_data.status.description,
                    is_accepted,
                    stdout,
                    stderr,
                    compile_output,
                    execution_time: poll_data.time,
                    memory_used_kb: poll_data.memory,
                    message,
                });
            }
        }

        Err(anyhow!(
            "Judge0 execution timed out waiting for token {}",
            token
        ))
    }

    fn decode_b64(input: &str) -> Option<String> {
        let clean = input.replace('\n', "").replace('\r', "").trim().to_string();
        if clean.is_empty() {
            return None;
        }
        match BASE64_STANDARD.decode(&clean) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).to_string()),
            Err(_) => Some(input.to_string()),
        }
    }
}
