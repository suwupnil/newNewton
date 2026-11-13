use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::api::NewtonClient;
use crate::mcp::protocol::{CallToolResult, Tool};
use crate::models::UserProfile;

pub fn tool_definition() -> Tool {
    Tool {
        name: "get_user_info".to_string(),
        description: "Retrieves the authenticated student's profile information from Newton LMS, including username, UID, full name, email, phone, role, batch, and associated account details.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfoResult {
    pub username: String,
    pub uid: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub full_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub role: Option<String>,
    pub batch: Option<String>,
    pub details: UserProfile,
}

pub async fn execute(client: &Arc<NewtonClient>, _args: Value) -> CallToolResult {
    let profile = match client.get_user_profile().await {
        Ok(p) => p,
        Err(e) => return CallToolResult::error(format!("Failed to fetch user profile: {}", e)),
    };

    let first = profile.first_name.clone().unwrap_or_default();
    let last = profile.last_name.clone().unwrap_or_default();
    let full_name = match (first.trim(), last.trim()) {
        ("", "") => profile.username.clone(),
        (f, "") => f.to_string(),
        ("", l) => l.to_string(),
        (f, l) => format!("{} {}", f, l),
    };

    let result = UserInfoResult {
        username: profile.username.clone(),
        uid: profile.uid.clone(),
        first_name: profile.first_name.clone(),
        last_name: profile.last_name.clone(),
        full_name,
        email: profile.email.clone(),
        phone: profile.phone.clone(),
        role: profile.role.clone(),
        batch: profile.batch.clone(),
        details: profile,
    };

    match serde_json::to_string_pretty(&result) {
        Ok(s) => CallToolResult::text(s),
        Err(e) => CallToolResult::error(format!("Serialization error: {}", e)),
    }
}
