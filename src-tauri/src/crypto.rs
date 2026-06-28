use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::{rngs::OsRng, RngCore};
use zeroize::Zeroizing;

use crate::error::{AegisError, Result};

pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;
pub const ARGON2_MEMORY_KIB: u32 = 64_000;
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 4;

pub type VaultKey = Zeroizing<[u8; KEY_LEN]>;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KdfParams {
    pub algorithm: String,
    pub memory_kib: u32,
    pub time_cost: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self {
            algorithm: "argon2id".to_string(),
            memory_kib: ARGON2_MEMORY_KIB,
            time_cost: ARGON2_TIME_COST,
            parallelism: ARGON2_PARALLELISM,
        }
    }
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    OsRng.fill_bytes(&mut out);
    out
}

pub fn derive_key(master_password: &str, salt: &[u8], params: &KdfParams) -> Result<VaultKey> {
    if params.algorithm != "argon2id" {
        return Err(AegisError::InvalidInput("unsupported KDF".to_string()));
    }

    let argon_params = Params::new(
        params.memory_kib,
        params.time_cost,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|_| AegisError::Crypto)?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon2
        .hash_password_into(master_password.as_bytes(), salt, key.as_mut_slice())
        .map_err(|_| AegisError::Crypto)?;
    Ok(key)
}

pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AegisError::Crypto)?;
    let nonce_bytes = random_bytes::<NONCE_LEN>();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| AegisError::Crypto)?;

    let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(blob)
}

pub fn decrypt(key: &[u8; KEY_LEN], encrypted_blob: &[u8]) -> Result<Vec<u8>> {
    if encrypted_blob.len() <= NONCE_LEN {
        return Err(AegisError::Crypto);
    }

    let (nonce_bytes, ciphertext) = encrypted_blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AegisError::Crypto)?;
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| AegisError::Crypto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let salt = random_bytes::<SALT_LEN>();
        let key = derive_key("correct horse battery staple", &salt, &KdfParams::default()).unwrap();
        let encrypted = encrypt(&key, b"secret").unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"secret");
    }

    #[test]
    fn tamper_detection_fails_decryption() {
        let salt = random_bytes::<SALT_LEN>();
        let key = derive_key("correct horse battery staple", &salt, &KdfParams::default()).unwrap();
        let mut encrypted = encrypt(&key, b"secret").unwrap();
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0x01;
        assert!(decrypt(&key, &encrypted).is_err());
    }
}
