use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::Result;

#[tauri::command]
pub fn copy_secret(app: AppHandle, text: String) -> Result<()> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|_| crate::error::AegisError::Filesystem)?;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        if let Ok(current) = app.clipboard().read_text() {
            if current == text {
                let _ = app.clipboard().clear();
            }
        }
    });
    Ok(())
}
