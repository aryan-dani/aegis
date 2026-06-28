use std::{collections::BTreeSet, fs, path::PathBuf};

use base64::Engine;
use rand::{rngs::OsRng, seq::SliceRandom, Rng};
use tauri::{AppHandle, State};
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::{
    crypto::{decrypt, derive_key, encrypt, random_bytes, KdfParams, SALT_LEN},
    db,
    error::{AegisError, Result},
    keystore::AppState,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VaultEntry {
    pub id: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub notes: String,
    pub folder: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct EntryInput {
    pub url: String,
    pub username: String,
    pub password: String,
    pub notes: String,
    pub folder: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct GeneratePasswordOptions {
    pub length: usize,
    pub uppercase: bool,
    pub lowercase: bool,
    pub numbers: bool,
    pub symbols: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExportFile {
    pub version: u32,
    pub salt_b64: String,
    pub kdf: KdfParams,
    pub encrypted_blob_b64: String,
    pub exported_at: String,
}

#[tauri::command]
pub fn add_entry(app: AppHandle, state: State<'_, AppState>, input: EntryInput) -> Result<VaultEntry> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    db::migrate(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let entry = VaultEntry {
        id: Uuid::new_v4().to_string(),
        url: input.url.trim().to_string(),
        username: input.username.trim().to_string(),
        password: input.password,
        notes: input.notes,
        folder: clean_optional(input.folder),
        tags: clean_tags(input.tags),
        created_at: now.clone(),
        updated_at: now,
    };
    let plaintext = Zeroizing::new(serde_json::to_vec(&entry)?);
    let encrypted = encrypt(&key, &plaintext)?;
    db::upsert_entry(&conn, &entry.id, &encrypted, &entry.created_at, &entry.updated_at)?;
    Ok(entry)
}

#[tauri::command]
pub fn get_entry(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<VaultEntry> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    let blob = db::encrypted_entry(&conn, &id)?;
    decrypt_entry(&key, &blob)
}

#[tauri::command]
pub fn list_entries(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<VaultEntry>> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    db::all_encrypted_entries(&conn)?
        .iter()
        .map(|blob| decrypt_entry(&key, blob))
        .collect()
}

#[tauri::command]
pub fn search_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<VaultEntry>> {
    let needle = query.trim().to_lowercase();
    let entries = list_entries(app, state)?;
    if needle.is_empty() {
        return Ok(entries);
    }
    Ok(entries
        .into_iter()
        .filter(|entry| {
            entry.url.to_lowercase().contains(&needle)
                || entry.username.to_lowercase().contains(&needle)
                || entry.notes.to_lowercase().contains(&needle)
                || entry.folder.as_deref().unwrap_or("").to_lowercase().contains(&needle)
                || entry
                    .tags
                    .iter()
                    .any(|tag| tag.to_lowercase().contains(&needle))
        })
        .collect())
}

#[tauri::command]
pub fn update_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: EntryInput,
) -> Result<VaultEntry> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    let existing_blob = db::encrypted_entry(&conn, &id)?;
    let existing = decrypt_entry(&key, &existing_blob)?;
    let entry = VaultEntry {
        id,
        url: input.url.trim().to_string(),
        username: input.username.trim().to_string(),
        password: input.password,
        notes: input.notes,
        folder: clean_optional(input.folder),
        tags: clean_tags(input.tags),
        created_at: existing.created_at,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    let plaintext = Zeroizing::new(serde_json::to_vec(&entry)?);
    let encrypted = encrypt(&key, &plaintext)?;
    db::upsert_entry(&conn, &entry.id, &encrypted, &entry.created_at, &entry.updated_at)?;
    Ok(entry)
}

#[tauri::command]
pub fn delete_entry(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    db::delete_entry(&conn, &id)
}

#[tauri::command]
pub fn list_folders(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>> {
    let mut folders = BTreeSet::new();
    for entry in list_entries(app, state)? {
        if let Some(folder) = entry.folder {
            folders.insert(folder);
        }
    }
    Ok(folders.into_iter().collect())
}

#[tauri::command]
pub fn list_tags(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>> {
    let mut tags = BTreeSet::new();
    for entry in list_entries(app, state)? {
        for tag in entry.tags {
            tags.insert(tag);
        }
    }
    Ok(tags.into_iter().collect())
}

#[tauri::command]
pub fn generate_password(options: GeneratePasswordOptions) -> Result<String> {
    let length = options.length.clamp(8, 128);
    let mut pools: Vec<&[u8]> = Vec::new();
    if options.lowercase {
        pools.push(b"abcdefghijkmnopqrstuvwxyz");
    }
    if options.uppercase {
        pools.push(b"ABCDEFGHJKLMNPQRSTUVWXYZ");
    }
    if options.numbers {
        pools.push(b"23456789");
    }
    if options.symbols {
        pools.push(b"!@#$%^&*()-_=+[]{};:,.?");
    }
    if pools.is_empty() {
        return Err(AegisError::InvalidInput(
            "select at least one character set".to_string(),
        ));
    }

    let mut rng = OsRng;
    let mut bytes = Vec::with_capacity(length);
    for pool in &pools {
        bytes.push(*pool.choose(&mut rng).ok_or(AegisError::Crypto)?);
    }
    let all: Vec<u8> = pools.iter().flat_map(|pool| pool.iter().copied()).collect();
    while bytes.len() < length {
        let idx = rng.gen_range(0..all.len());
        bytes.push(all[idx]);
    }
    bytes.shuffle(&mut rng);
    String::from_utf8(bytes).map_err(|_| AegisError::Crypto)
}

#[tauri::command]
pub fn export_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    passphrase: String,
    path: String,
) -> Result<()> {
    if passphrase.len() < 12 {
        return Err(AegisError::InvalidInput(
            "export passphrase must be at least 12 characters".to_string(),
        ));
    }
    let entries = list_entries(app, state)?;
    let salt = random_bytes::<SALT_LEN>();
    let kdf = KdfParams::default();
    let export_key = derive_key(&passphrase, &salt, &kdf)?;
    let plaintext = Zeroizing::new(serde_json::to_vec(&entries)?);
    let encrypted = encrypt(&export_key, &plaintext)?;
    let file = ExportFile {
        version: 1,
        salt_b64: base64::engine::general_purpose::STANDARD_NO_PAD.encode(salt),
        kdf,
        encrypted_blob_b64: base64::engine::general_purpose::STANDARD_NO_PAD.encode(encrypted),
        exported_at: chrono::Utc::now().to_rfc3339(),
    };
    fs::write(PathBuf::from(path), serde_json::to_string_pretty(&file)?)?;
    Ok(())
}

#[tauri::command]
pub fn import_encrypted_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    passphrase: String,
    path: String,
) -> Result<Vec<VaultEntry>> {
    let contents = fs::read_to_string(PathBuf::from(path))?;
    let file: ExportFile = serde_json::from_str(&contents)?;
    let salt = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(file.salt_b64)
        .map_err(|_| AegisError::InvalidInput("invalid backup".to_string()))?;
    let export_key = derive_key(&passphrase, &salt, &file.kdf)?;
    let encrypted = base64::engine::general_purpose::STANDARD_NO_PAD
        .decode(file.encrypted_blob_b64)
        .map_err(|_| AegisError::InvalidInput("invalid backup".to_string()))?;
    let plaintext = Zeroizing::new(decrypt(&export_key, &encrypted)?);
    let imported: Vec<VaultEntry> = serde_json::from_slice(&plaintext)?;
    insert_imported_entries(app, state, imported)
}

#[tauri::command]
pub fn import_bitwarden_csv(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<VaultEntry>> {
    let mut rdr = csv::Reader::from_path(PathBuf::from(path)).map_err(|_| AegisError::Filesystem)?;
    let headers = rdr
        .headers()
        .map_err(|_| AegisError::InvalidInput("invalid CSV".to_string()))?
        .clone();
    let mut entries = Vec::new();
    for row in rdr.records() {
        let row = row.map_err(|_| AegisError::InvalidInput("invalid CSV".to_string()))?;
        let field = |name: &str| -> String {
            headers
                .iter()
                .position(|header| header.eq_ignore_ascii_case(name))
                .and_then(|idx| row.get(idx))
                .unwrap_or_default()
                .to_string()
        };
        let now = chrono::Utc::now().to_rfc3339();
        let folder = clean_optional(Some(field("folder")));
        let tags = field("tags")
            .split(',')
            .map(str::to_string)
            .collect::<Vec<_>>();
        entries.push(VaultEntry {
            id: Uuid::new_v4().to_string(),
            url: field("login_uri"),
            username: field("login_username"),
            password: field("login_password"),
            notes: field("notes"),
            folder,
            tags: clean_tags(tags),
            created_at: now.clone(),
            updated_at: now,
        });
    }
    insert_imported_entries(app, state, entries)
}

fn insert_imported_entries(
    app: AppHandle,
    state: State<'_, AppState>,
    mut entries: Vec<VaultEntry>,
) -> Result<Vec<VaultEntry>> {
    let key = Zeroizing::new(state.key_copy()?);
    let conn = db::open_encrypted(&app, &key)?;
    db::migrate(&conn)?;
    for entry in &mut entries {
        if entry.id.trim().is_empty() {
            entry.id = Uuid::new_v4().to_string();
        }
        entry.updated_at = chrono::Utc::now().to_rfc3339();
        let plaintext = Zeroizing::new(serde_json::to_vec(entry)?);
        let encrypted = encrypt(&key, &plaintext)?;
        db::upsert_entry(&conn, &entry.id, &encrypted, &entry.created_at, &entry.updated_at)?;
    }
    Ok(entries)
}

fn decrypt_entry(key: &[u8; 32], blob: &[u8]) -> Result<VaultEntry> {
    let mut plaintext = Zeroizing::new(decrypt(key, blob)?);
    let entry = serde_json::from_slice(&plaintext)?;
    plaintext.zeroize();
    Ok(entry)
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut cleaned = BTreeSet::new();
    for tag in tags {
        let tag = tag.trim().trim_start_matches('#').to_string();
        if !tag.is_empty() {
            cleaned.insert(tag);
        }
    }
    cleaned.into_iter().collect()
}
