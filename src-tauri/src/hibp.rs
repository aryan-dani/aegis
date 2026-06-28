use sha1::{Digest, Sha1};

use crate::error::{AegisError, Result};

#[derive(Debug, Clone, serde::Serialize)]
pub struct BreachCheckResult {
    pub found: bool,
    pub count: u64,
}

#[tauri::command]
pub fn check_password_breach(password: String) -> Result<BreachCheckResult> {
    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    let hash = hex::encode_upper(hasher.finalize());
    let (prefix, suffix) = hash.split_at(5);
    let url = format!("https://api.pwnedpasswords.com/range/{prefix}");
    let body = reqwest::blocking::Client::builder()
        .user_agent("Aegis local password manager")
        .build()
        .map_err(|_| AegisError::Network)?
        .get(url)
        .header("Add-Padding", "true")
        .send()
        .map_err(|_| AegisError::Network)?
        .error_for_status()
        .map_err(|_| AegisError::Network)?
        .text()
        .map_err(|_| AegisError::Network)?;

    for line in body.lines() {
        if let Some((candidate, count)) = line.split_once(':') {
            if candidate.eq_ignore_ascii_case(suffix) {
                return Ok(BreachCheckResult {
                    found: true,
                    count: count.parse().unwrap_or(0),
                });
            }
        }
    }

    Ok(BreachCheckResult { found: false, count: 0 })
}
