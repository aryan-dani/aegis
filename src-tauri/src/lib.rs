mod auth;
mod biometric;
mod clipboard;
mod crypto;
mod db;
mod error;
mod hibp;
mod keystore;
mod vault;

use std::time::Duration;

use keystore::AppState;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(state) = app.try_state::<AppState>() {
                            state.lock();
                            let _ = app.emit("vault-locked", "manual-shortcut");
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_content_protected(true);
            }

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);
            let _ = app.global_shortcut().register(shortcut);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if let Some(state) = handle.try_state::<AppState>() {
                        if state.should_auto_lock() {
                            state.lock();
                            let _ = handle.emit("vault-locked", "inactivity");
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::vault_exists,
            auth::is_unlocked,
            auth::create_vault,
            auth::unlock_vault,
            auth::lock_vault,
            auth::set_inactivity_timeout,
            vault::add_entry,
            vault::get_entry,
            vault::list_entries,
            vault::search_vault,
            vault::update_entry,
            vault::delete_entry,
            vault::list_folders,
            vault::list_tags,
            vault::generate_password,
            vault::export_vault,
            vault::import_encrypted_backup,
            vault::import_bitwarden_csv,
            clipboard::copy_secret,
            hibp::check_password_breach,
            biometric::biometric_status,
            biometric::enroll_biometric,
            biometric::biometric_unlock,
            biometric::disable_biometric
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::fs;

    use zeroize::Zeroizing;

    use crate::{
        crypto::{decrypt, derive_key, encrypt, random_bytes, KdfParams, SALT_LEN},
        db,
    };

    #[test]
    fn phase_one_vault_flow_persists_encrypted_entry() {
        let dir = std::env::temp_dir().join(format!("aegis-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let db_file = dir.join("vault.db");
        let salt = random_bytes::<SALT_LEN>();
        let key = derive_key("correct horse battery staple", &salt, &KdfParams::default()).unwrap();

        {
            let conn = db::open_encrypted_path(&db_file, &key).unwrap();
            db::migrate(&conn).unwrap();
            let verifier = encrypt(&key, b"aegis-vault-verifier-v1").unwrap();
            db::insert_verifier(&conn, &verifier).unwrap();
            let entry = serde_json::json!({
                "id": "entry-1",
                "url": "https://example.com",
                "username": "user@example.com",
                "password": "secret",
                "notes": "",
                "folder": "Work",
                "tags": ["prod"],
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z"
            });
            let plaintext = Zeroizing::new(serde_json::to_vec(&entry).unwrap());
            let encrypted = encrypt(&key, &plaintext).unwrap();
            db::upsert_entry(
                &conn,
                "entry-1",
                &encrypted,
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
            )
            .unwrap();
        }

        let conn = db::open_encrypted_path(&db_file, &key).unwrap();
        let verifier = db::verifier(&conn).unwrap();
        assert_eq!(
            decrypt(&key, &verifier).unwrap(),
            b"aegis-vault-verifier-v1"
        );
        let blobs = db::all_encrypted_entries(&conn).unwrap();
        assert_eq!(blobs.len(), 1);
        let plaintext = decrypt(&key, &blobs[0]).unwrap();
        let entry: serde_json::Value = serde_json::from_slice(&plaintext).unwrap();
        assert_eq!(entry["url"], "https://example.com");

        let _ = fs::remove_dir_all(dir);
    }
}
