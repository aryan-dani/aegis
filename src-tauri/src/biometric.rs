use std::{fs, path::PathBuf};

use tauri::{AppHandle, State};
use zeroize::Zeroizing;

use crate::{
    crypto::{decrypt, VaultKey},
    db,
    error::{AegisError, Result},
    keystore::AppState,
};

const BIOMETRIC_KEY_FILE: &str = "windows-hello.key";
const VERIFIER: &[u8] = b"aegis-vault-verifier-v1";

#[derive(Debug, Clone, serde::Serialize)]
pub struct BiometricStatus {
    pub available: bool,
    pub enrolled: bool,
    pub message: String,
}

#[tauri::command]
pub fn biometric_status(app: AppHandle) -> Result<BiometricStatus> {
    let mut status = platform_biometric_status()?;
    status.enrolled = biometric_key_path(&app)?.exists();
    Ok(status)
}

#[tauri::command]
pub fn enroll_biometric(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let key = Zeroizing::new(state.key_copy()?);
    let protected = platform_protect_key(&key)?;
    fs::write(biometric_key_path(&app)?, protected)?;
    Ok(())
}

#[tauri::command]
pub fn biometric_unlock(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let path = biometric_key_path(&app)?;
    if !path.exists() {
        return Err(AegisError::BiometricNotEnrolled);
    }

    let protected = fs::read(path)?;
    let key = platform_unprotect_key(&protected)?;

    let conn = db::open_encrypted(&app, &key)?;
    db::migrate(&conn)?;
    let verifier = db::verifier(&conn)?;
    let plaintext = decrypt(&key, &verifier)?;
    if plaintext != VERIFIER {
        return Err(AegisError::InvalidMasterPassword);
    }

    state.set_key(key)?;
    Ok(())
}

#[tauri::command]
pub fn disable_biometric(app: AppHandle) -> Result<()> {
    let path = biometric_key_path(&app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn biometric_key_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(db::vault_dir(app)?.join(BIOMETRIC_KEY_FILE))
}

#[cfg(windows)]
fn platform_biometric_status() -> Result<BiometricStatus> {
    Ok(BiometricStatus {
        available: true,
        enrolled: false,
        message: "Windows Hello is checked by the app window before key release.".to_string(),
    })
}

#[cfg(windows)]
fn platform_protect_key(key: &[u8; 32]) -> Result<Vec<u8>> {
    use std::ptr::null_mut;
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{LocalFree, HLOCAL},
            Security::Cryptography::{
                CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        },
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: key.len() as u32,
        pbData: key.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        CryptProtectData(
            &mut input,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|_| AegisError::Crypto)?;

        let protected = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(protected)
    }
}

#[cfg(windows)]
fn platform_unprotect_key(protected: &[u8]) -> Result<VaultKey> {
    use std::ptr::null_mut;
    use windows::{
        Win32::{
            Foundation::{LocalFree, HLOCAL},
            Security::Cryptography::{
                CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
            },
        },
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: protected.len() as u32,
        pbData: protected.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        CryptUnprotectData(
            &mut input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|_| AegisError::Crypto)?;

        if output.cbData as usize != 32 {
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            return Err(AegisError::Crypto);
        }
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(std::slice::from_raw_parts(output.pbData, 32));
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(key)
    }
}

#[cfg(not(windows))]
fn platform_biometric_status() -> Result<BiometricStatus> {
    Ok(BiometricStatus {
        available: false,
        enrolled: false,
        message: "Biometric unlock is only probed on Windows in this build.".to_string(),
    })
}

#[cfg(not(windows))]
fn platform_protect_key(_key: &[u8; 32]) -> Result<Vec<u8>> {
    Err(AegisError::BiometricUnavailable)
}

#[cfg(not(windows))]
fn platform_unprotect_key(_protected: &[u8]) -> Result<VaultKey> {
    Err(AegisError::BiometricUnavailable)
}
