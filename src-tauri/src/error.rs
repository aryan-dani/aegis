use thiserror::Error;

#[derive(Debug, Error)]
pub enum AegisError {
    #[error("vault is locked")]
    Locked,
    #[error("vault already exists")]
    VaultExists,
    #[error("vault has not been created")]
    VaultMissing,
    #[error("invalid master password")]
    InvalidMasterPassword,
    #[error("too many failed attempts; try again in {0} seconds")]
    LockedOut(u64),
    #[error("entry not found")]
    EntryNotFound,
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("cryptographic operation failed")]
    Crypto,
    #[error("database operation failed")]
    Database,
    #[error("filesystem operation failed")]
    Filesystem,
    #[error("network operation failed")]
    Network,
    #[error("biometric unlock is not available on this device")]
    BiometricUnavailable,
    #[error("Windows Hello verification was cancelled")]
    BiometricCancelled,
    #[error("Windows Hello is busy; try again")]
    BiometricBusy,
    #[error("Windows Hello unlock has not been enrolled for this vault")]
    BiometricNotEnrolled,
}

impl From<rusqlite::Error> for AegisError {
    fn from(_: rusqlite::Error) -> Self {
        Self::Database
    }
}

impl From<std::io::Error> for AegisError {
    fn from(_: std::io::Error) -> Self {
        Self::Filesystem
    }
}

impl From<serde_json::Error> for AegisError {
    fn from(_: serde_json::Error) -> Self {
        Self::InvalidInput("invalid JSON payload".to_string())
    }
}

impl From<tauri::Error> for AegisError {
    fn from(_: tauri::Error) -> Self {
        Self::Filesystem
    }
}

pub type Result<T> = std::result::Result<T, AegisError>;

impl serde::Serialize for AegisError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
