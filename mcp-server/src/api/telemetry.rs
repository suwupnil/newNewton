use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde_json::json;
use std::sync::Arc;

use crate::config::Config;

#[derive(Clone)]
pub struct TelemetryClient {
    client: reqwest::Client,
    config: Arc<Config>,
}

impl TelemetryClient {
    pub fn new(config: Arc<Config>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            ),
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self { client, config }
    }

    pub fn is_enabled(&self) -> bool {
        self.config.is_telemetry_enabled()
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.config.set_telemetry_enabled(enabled);
    }

    pub async fn emit_editor_save(
        &self,
        playground_hash: &str,
        username: &str,
        language_id: i64,
        char_count: usize,
    ) {
        if !self.is_enabled() {
            return;
        }

        let now_ms = chrono::Utc::now().timestamp_millis();

        // 1. Dispatch to AWS ECS events endpoint
        let aws_url =
            "https://e1-0850197d5e074be58352ddc860645af6.ecs.us-east-1.on.aws/events?cee=no";
        let aws_payload = json!({
            "event": "editor_save_event",
            "timestamp": now_ms,
            "properties": {
                "playground_hash": playground_hash,
                "username": username,
                "language_id": language_id,
                "char_count": char_count,
                "client_source": "newton_editor_web"
            }
        });

        let client = self.client.clone();
        let aws_payload_clone = aws_payload.clone();
        tokio::spawn(async move {
            let _ = client.post(aws_url).json(&aws_payload_clone).send().await;
        });

        // 2. Dispatch to OpenPanel tracking endpoint
        let openpanel_url = "https://openpanel-api.newtonschool.co/track";
        let openpanel_payload = json!({
            "event": "editor_save",
            "profileId": username,
            "timestamp": now_ms,
            "properties": {
                "playground": playground_hash,
                "language": language_id
            }
        });

        let client2 = self.client.clone();
        tokio::spawn(async move {
            let _ = client2
                .post(openpanel_url)
                .json(&openpanel_payload)
                .send()
                .await;
        });
    }
}
