use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

use crate::config::Config;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JevDecision {
    pub jev_available: bool,
    pub selected_language: Option<String>,
    pub selected_language_id: Option<i64>,
    pub reasoning: String,
    pub raw_response: Option<Value>,
}

#[derive(Clone)]
pub struct JevClient {
    client: reqwest::Client,
    config: Arc<Config>,
}

impl JevClient {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            client: reqwest::Client::new(),
            config,
        }
    }

    #[allow(dead_code)]
    pub fn is_configured(&self) -> bool {
        self.config.typesafe_api_key.is_some()
    }

    pub async fn decide_language(
        &self,
        problem_title: &str,
        constraints: &str,
        allowed_languages: &[(i64, String)],
        course_name: Option<&str>,
    ) -> JevDecision {
        let api_key = match &self.config.typesafe_api_key {
            Some(key) => key,
            None => {
                return JevDecision {
                    jev_available: false,
                    selected_language: None,
                    selected_language_id: None,
                    reasoning: "TYPESAFE_API_KEY is not configured in the environment. MCP client or user should decide the target language before solving.".to_string(),
                    raw_response: None,
                };
            }
        };

        let lang_options: Vec<String> = allowed_languages
            .iter()
            .map(|(_, name)| name.clone())
            .collect();
        let prompt = format!(
            "Problem: {}\nConstraints: {}\nCourse context: {}\nAvailable languages: {}\nTask: Choose the optimal language to solve this problem within time and memory constraints, respecting the course syllabus.",
            problem_title,
            constraints,
            course_name.unwrap_or("Newton School of Technology B.Tech CS"),
            lang_options.join(", ")
        );

        let mut headers = HeaderMap::new();
        if let Ok(auth_val) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
            headers.insert(AUTHORIZATION, auth_val);
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let payload = serde_json::json!({
            "model": "jev-latest",
            "primitive": "choice",
            "prompt": prompt,
            "options": lang_options,
        });

        match self
            .client
            .post(&self.config.jev_base_url)
            .headers(headers)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(json) = resp.json::<Value>().await {
                    let choice = json
                        .get("choice")
                        .and_then(|c| c.as_str())
                        .or_else(|| json.get("result").and_then(|r| r.as_str()))
                        .unwrap_or("");

                    let matching_lang = allowed_languages.iter().find(|(_, name)| {
                        name.to_lowercase().contains(&choice.to_lowercase())
                            || choice.to_lowercase().contains(&name.to_lowercase())
                    });

                    let (lang_id, lang_name) = match matching_lang {
                        Some((id, name)) => (Some(*id), Some(name.clone())),
                        None => {
                            if let Some(first) = allowed_languages.first() {
                                (Some(first.0), Some(first.1.clone()))
                            } else {
                                (None, None)
                            }
                        }
                    };

                    let reasoning = json.get("reasoning")
                        .and_then(|r| r.as_str())
                        .unwrap_or("Decided by TypeSafe Jev System One based on problem constraints and course context")
                        .to_string();

                    JevDecision {
                        jev_available: true,
                        selected_language: lang_name,
                        selected_language_id: lang_id,
                        reasoning,
                        raw_response: Some(json),
                    }
                } else {
                    Self::fallback_decision(allowed_languages, constraints)
                }
            }
            Ok(resp) => {
                let err_text = resp.text().await.unwrap_or_default();
                let mut fallback = Self::fallback_decision(allowed_languages, constraints);
                fallback.reasoning = format!("Jev API returned HTTP error ({}). Fallback decision applied. Client may override.", err_text);
                fallback
            }
            Err(e) => {
                let mut fallback = Self::fallback_decision(allowed_languages, constraints);
                fallback.reasoning = format!(
                    "Jev API unreachable ({}). Fallback decision applied. Client may override.",
                    e
                );
                fallback
            }
        }
    }

    fn fallback_decision(allowed_languages: &[(i64, String)], constraints: &str) -> JevDecision {
        let is_tight = constraints.contains("10^5")
            || constraints.contains("100000")
            || constraints.contains("10^6");

        // Prefer Python (71) for standard scripting unless tight constraints favor C++ (54) / Java (62)
        let chosen = if is_tight {
            allowed_languages
                .iter()
                .find(|(id, _)| *id == 54 || *id == 62)
                .or_else(|| allowed_languages.iter().find(|(id, _)| *id == 71))
                .or_else(|| allowed_languages.first())
        } else {
            allowed_languages
                .iter()
                .find(|(id, _)| *id == 71)
                .or_else(|| allowed_languages.first())
        };

        if let Some((id, name)) = chosen {
            JevDecision {
                jev_available: false,
                selected_language: Some(name.clone()),
                selected_language_id: Some(*id),
                reasoning: format!("Heuristic fallback (tight constraints = {}): selected {}. MCP client may override before solving.", is_tight, name),
                raw_response: None,
            }
        } else {
            JevDecision {
                jev_available: false,
                selected_language: None,
                selected_language_id: None,
                reasoning: "No languages available in mapping. MCP client must specify language."
                    .to_string(),
                raw_response: None,
            }
        }
    }
}
