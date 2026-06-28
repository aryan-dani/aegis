use std::{fs, path::{Path, PathBuf}};

use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};

use crate::{
    crypto::{KdfParams, SALT_LEN},
    error::{AegisError, Result},
};

const META_FILE: &str = "vault.meta.json";
const DB_FILE: &str = "vault.db";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VaultMeta {
    pub version: u32,
    pub salt_b64: String,
    pub kdf: KdfParams,
    pub created_at: String,
}

impl VaultMeta {
    pub fn new(salt: &[u8; SALT_LEN]) -> Self {
        Self {
            version: 1,
            salt_b64: STANDARD_NO_PAD.encode(salt),
            kdf: KdfParams::default(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn salt(&self) -> Result<Vec<u8>> {
        STANDARD_NO_PAD
            .decode(&self.salt_b64)
            .map_err(|_| AegisError::InvalidInput("invalid vault metadata".to_string()))
    }
}

pub fn vault_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(vault_dir(app)?.join(DB_FILE))
}

pub fn meta_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(vault_dir(app)?.join(META_FILE))
}

pub fn vault_exists(app: &AppHandle) -> Result<bool> {
    Ok(db_path(app)?.exists() && meta_path(app)?.exists())
}

pub fn read_meta(app: &AppHandle) -> Result<VaultMeta> {
    let contents = fs::read_to_string(meta_path(app)?)?;
    Ok(serde_json::from_str(&contents)?)
}

pub fn write_meta(app: &AppHandle, meta: &VaultMeta) -> Result<()> {
    let contents = serde_json::to_string_pretty(meta)?;
    fs::write(meta_path(app)?, contents)?;
    Ok(())
}

pub fn open_encrypted(app: &AppHandle, key: &[u8; 32]) -> Result<Connection> {
    open_encrypted_path(db_path(app)?, key)
}

pub fn open_encrypted_path(path: impl AsRef<Path>, key: &[u8; 32]) -> Result<Connection> {
    let conn = Connection::open(path)?;
    let hex_key = hex::encode(key);
    conn.execute_batch(&format!(
        r#"
        PRAGMA key = "x'{hex_key}'";
        PRAGMA cipher_memory_security = ON;
        PRAGMA foreign_keys = ON;
        SELECT count(*) FROM sqlite_master;
        "#
    ))?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS vault_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            verifier_blob BLOB NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY NOT NULL,
            encrypted_blob BLOB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
        "#,
    )?;
    Ok(())
}

pub fn insert_verifier(conn: &Connection, verifier_blob: &[u8]) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO vault_meta (id, verifier_blob, created_at) VALUES (1, ?1, ?2)",
        params![verifier_blob, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn verifier(conn: &Connection) -> Result<Vec<u8>> {
    conn.query_row(
        "SELECT verifier_blob FROM vault_meta WHERE id = 1",
        [],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(AegisError::VaultMissing)
}

pub fn upsert_entry(
    conn: &Connection,
    id: &str,
    encrypted_blob: &[u8],
    created_at: &str,
    updated_at: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO entries (id, encrypted_blob, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
            encrypted_blob = excluded.encrypted_blob,
            updated_at = excluded.updated_at
        "#,
        params![id, encrypted_blob, created_at, updated_at],
    )?;
    Ok(())
}

pub fn encrypted_entry(conn: &Connection, id: &str) -> Result<Vec<u8>> {
    conn.query_row(
        "SELECT encrypted_blob FROM entries WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(AegisError::EntryNotFound)
}

pub fn all_encrypted_entries(conn: &Connection) -> Result<Vec<Vec<u8>>> {
    let mut stmt = conn.prepare("SELECT encrypted_blob FROM entries ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn delete_entry(conn: &Connection, id: &str) -> Result<()> {
    let deleted = conn.execute("DELETE FROM entries WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AegisError::EntryNotFound);
    }
    Ok(())
}
