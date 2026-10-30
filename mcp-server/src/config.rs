use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct Config {
    pub auth_token: String,
    pub parent_course_hash: Option<String>,
    pub typesafe_api_key: Option<String>,
    pub lms_base_url: String,
    pub judge0_base_url: String,
    pub jev_base_url: String,
    pub telemetry_enabled: Arc<AtomicBool>,
}

impl Config {
    pub fn load() -> Result<Self, String> {
        let auth_token = Self::resolve_auth_token()?;
        let parent_course_hash = std::env::var("NEWTON_PARENT_COURSE_HASH")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let typesafe_api_key = std::env::var("TYPESAFE_API_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let lms_base_url = std::env::var("NEWTON_LMS_URL")
            .unwrap_or_else(|_| "https://my.newtonschool.co".to_string());
        let judge0_base_url = std::env::var("NEWTON_JUDGE0_URL")
            .unwrap_or_else(|_| "https://judge0-public.newtonschool.co".to_string());
        let jev_base_url = std::env::var("TYPESAFE_JEV_URL")
            .unwrap_or_else(|_| "https://api.typesafe.ai/v1/systemone".to_string());

        let telemetry_initial = std::env::var("NEWTON_ENABLE_TELEMETRY")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        Ok(Self {
            auth_token,
            parent_course_hash,
            typesafe_api_key,
            lms_base_url,
            judge0_base_url,
            jev_base_url,
            telemetry_enabled: Arc::new(AtomicBool::new(telemetry_initial)),
        })
    }

    #[allow(dead_code)]
    pub fn from_env() -> Result<Self, String> {
        Self::load()
    }

    fn resolve_auth_token() -> Result<String, String> {
        if let Ok(token) = std::env::var("NEWTON_AUTH_TOKEN") {
            let trimmed = token.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(trimmed);
            }
        }

        // Check common locations relative to current working directory
        let mut candidate_paths = vec![
            PathBuf::from(".env/auth.key"),
            PathBuf::from("auth.key"),
            PathBuf::from("auth-token"),
            PathBuf::from(".auth.key"),
            PathBuf::from(".auth-token"),
            PathBuf::from("../.env/auth.key"),
            PathBuf::from("../../.env/auth.key"),
        ];

        // Check locations relative to executable's directory (portable across arbitrary working dirs)
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                candidate_paths.push(exe_dir.join(".env").join("auth.key"));
                candidate_paths.push(exe_dir.join("..").join(".env").join("auth.key"));
                candidate_paths.push(exe_dir.join("..").join("..").join(".env").join("auth.key"));
                candidate_paths.push(
                    exe_dir
                        .join("..")
                        .join("..")
                        .join("..")
                        .join(".env")
                        .join("auth.key"),
                );
            }
        }

        // Check user home directory configurations
        if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
            let home_path = PathBuf::from(home);
            candidate_paths.push(home_path.join(".config").join("newton").join("auth.key"));
            candidate_paths.push(home_path.join(".config").join("newton").join("auth-token"));
            candidate_paths.push(home_path.join(".newton").join("auth.key"));
            candidate_paths.push(home_path.join(".newton").join("auth-token"));
        }

        for path in &candidate_paths {
            if path.exists() {
                if let Ok(content) = fs::read_to_string(path) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        return Ok(trimmed);
                    }
                }
            }
        }

        Err("Newton Auth Token not found. Set NEWTON_AUTH_TOKEN environment variable or provide .env/auth.key".to_string())
    }

    pub fn is_telemetry_enabled(&self) -> bool {
        self.telemetry_enabled.load(Ordering::Relaxed)
    }

    pub fn set_telemetry_enabled(&self, enabled: bool) {
        self.telemetry_enabled.store(enabled, Ordering::Relaxed);
    }
}
