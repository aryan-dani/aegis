use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use crate::{
    crypto::{VaultKey, KEY_LEN},
    error::{AegisError, Result},
};

pub struct AppState {
    inner: Mutex<KeyStore>,
}

struct KeyStore {
    key: Option<VaultKey>,
    last_activity: Instant,
    inactivity_timeout: Duration,
    failed_attempts: u32,
    lockout_until: Option<Instant>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(KeyStore {
                key: None,
                last_activity: Instant::now(),
                inactivity_timeout: Duration::from_secs(5 * 60),
                failed_attempts: 0,
                lockout_until: None,
            }),
        }
    }

    pub fn set_key(&self, key: VaultKey) -> Result<()> {
        let mut inner = self.inner.lock().map_err(|_| AegisError::Locked)?;
        inner.key = Some(key);
        inner.last_activity = Instant::now();
        inner.failed_attempts = 0;
        inner.lockout_until = None;
        Ok(())
    }

    pub fn key_copy(&self) -> Result<[u8; KEY_LEN]> {
        let mut inner = self.inner.lock().map_err(|_| AegisError::Locked)?;
        inner.last_activity = Instant::now();
        inner.key.as_deref().copied().ok_or(AegisError::Locked)
    }

    pub fn is_unlocked(&self) -> bool {
        self.inner
            .lock()
            .map(|inner| inner.key.is_some())
            .unwrap_or(false)
    }

    pub fn lock(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.key = None;
        }
    }

    pub fn set_inactivity_timeout(&self, seconds: u64) -> Result<()> {
        if seconds < 30 {
            return Err(AegisError::InvalidInput(
                "timeout must be at least 30 seconds".to_string(),
            ));
        }
        let mut inner = self.inner.lock().map_err(|_| AegisError::Locked)?;
        inner.inactivity_timeout = Duration::from_secs(seconds);
        Ok(())
    }

    pub fn should_auto_lock(&self) -> bool {
        self.inner
            .lock()
            .map(|inner| {
                inner.key.is_some() && inner.last_activity.elapsed() >= inner.inactivity_timeout
            })
            .unwrap_or(false)
    }

    pub fn record_failed_unlock(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.failed_attempts = inner.failed_attempts.saturating_add(1);
            if inner.failed_attempts >= 5 {
                let exponent = (inner.failed_attempts - 5).min(5);
                let seconds = 30u64.saturating_mul(2u64.saturating_pow(exponent));
                inner.lockout_until = Some(Instant::now() + Duration::from_secs(seconds));
            }
        }
    }

    pub fn ensure_not_locked_out(&self) -> Result<()> {
        let mut inner = self.inner.lock().map_err(|_| AegisError::Locked)?;
        if let Some(until) = inner.lockout_until {
            if until > Instant::now() {
                return Err(AegisError::LockedOut(
                    until.duration_since(Instant::now()).as_secs().max(1),
                ));
            }
            inner.lockout_until = None;
        }
        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
