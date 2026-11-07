use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use std::collections::HashSet;
use std::sync::Arc;

use crate::config::Config;
use crate::models::SupabaseQuizRecord;

#[derive(Clone)]
#[allow(dead_code)]
pub struct SupabaseClient {
    client: reqwest::Client,
    supabase_url: String,
    anon_key: String,
}

#[allow(dead_code)]
impl SupabaseClient {
    pub fn new(config: Arc<Config>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&config.supabase_anon_key)
                .map_err(|e| anyhow!("Invalid supabase anon key: {}", e))?,
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", config.supabase_anon_key))
                .map_err(|e| anyhow!("Invalid supabase auth header: {}", e))?,
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("newton-enhancer-mcp/0.1.0"),
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(15))
            .build()?;

        let supabase_url = config.supabase_url.trim_end_matches('/').to_string();

        Ok(Self {
            client,
            supabase_url,
            anon_key: config.supabase_anon_key.clone(),
        })
    }

    pub fn supabase_url(&self) -> &str {
        &self.supabase_url
    }

    pub fn anon_key(&self) -> &str {
        &self.anon_key
    }

    pub async fn get_quiz_solutions(&self, assessment_hash: &str) -> Result<Option<SupabaseQuizRecord>> {
        let clean_hash = assessment_hash
            .trim_start_matches("h/")
            .trim_matches('/');

        let url = format!(
            "{}/rest/v1/quizzes?assessment_hash=eq.{}&select=*",
            self.supabase_url, clean_hash
        );

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Supabase query failed for assessment {}: HTTP {}",
                clean_hash,
                resp.status()
            ));
        }

        let records: Vec<SupabaseQuizRecord> = resp.json().await?;
        Ok(records.into_iter().next())
    }

    pub async fn get_all_solved_assessment_hashes(&self) -> Result<HashSet<String>> {
        let url = format!(
            "{}/rest/v1/quizzes?select=assessment_hash,has_answers_revealed",
            self.supabase_url
        );

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "Supabase list query failed: HTTP {}",
                resp.status()
            ));
        }

        #[derive(serde::Deserialize)]
        struct MiniQuiz {
            assessment_hash: String,
        }

        let list: Vec<MiniQuiz> = resp.json().await?;
        let set: HashSet<String> = list.into_iter().map(|q| q.assessment_hash).collect();
        Ok(set)
    }
}
