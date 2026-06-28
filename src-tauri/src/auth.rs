use tauri::{AppHandle, State};
use zeroize::Zeroize;

use crate::{
    crypto::{decrypt, derive_key, encrypt, random_bytes, KdfParams, SALT_LEN},
    db,
    error::{AegisError, Result},
    keystore::AppState,
};

const VERIFIER: &[u8] = b"aegis-vault-verifier-v1";

#[tauri::command]
pub fn vault_exists(app: AppHandle) -> Result<bool> {
    db::vault_exists(&app)
}

#[tauri::command]
pub fn is_unlocked(state: State<'_, AppState>) -> bool {
    state.is_unlocked()
}

#[tauri::command]
pub fn create_vault(app: AppHandle, state: State<'_, AppState>, master_password: String) -> Result<()> {
    if db::vault_exists(&app)? {
        return Err(AegisError::VaultExists);
    }
    validate_master_password(&master_password)?;

    let salt = random_bytes::<SALT_LEN>();
    let meta = db::VaultMeta::new(&salt);
    let key = derive_key(&master_password, &salt, &KdfParams::default())?;
    let conn = db::open_encrypted(&app, &key)?;
    db::migrate(&conn)?;
    let verifier = encrypt(&key, VERIFIER)?;
    db::insert_verifier(&conn, &verifier)?;
    db::write_meta(&app, &meta)?;
    state.set_key(key)?;
    Ok(())
}

#[tauri::command]
pub fn unlock_vault(app: AppHandle, state: State<'_, AppState>, master_password: String) -> Result<()> {
    state.ensure_not_locked_out()?;
    if !db::vault_exists(&app)? {
        return Err(AegisError::VaultMissing);
    }

    let meta = db::read_meta(&app)?;
    let mut salt = meta.salt()?;
    let key = derive_key(&master_password, &salt, &meta.kdf)?;
    salt.zeroize();

    let result = (|| -> Result<()> {
        let conn = db::open_encrypted(&app, &key)?;
        db::migrate(&conn)?;
        let verifier = db::verifier(&conn)?;
        let plaintext = decrypt(&key, &verifier)?;
        if plaintext != VERIFIER {
            return Err(AegisError::InvalidMasterPassword);
        }
        Ok(())
    })();

    match result {
        Ok(()) => state.set_key(key),
        Err(_) => {
            state.record_failed_unlock();
            Err(AegisError::InvalidMasterPassword)
        }
    }
}

#[tauri::command]
pub fn lock_vault(state: State<'_, AppState>) -> Result<()> {
    state.lock();
    Ok(())
}

#[tauri::command]
pub fn set_inactivity_timeout(state: State<'_, AppState>, seconds: u64) -> Result<()> {
    state.set_inactivity_timeout(seconds)
}

fn validate_master_password(master_password: &str) -> Result<()> {
    if master_password.len() < 12 {
        return Err(AegisError::InvalidInput(
            "master password must be at least 12 characters".to_string(),
        ));
    }
    Ok(())
}
