import { invoke } from "@tauri-apps/api/core";
import type {
  BiometricStatus,
  BreachCheckResult,
  EntryInput,
  GeneratePasswordOptions,
  VaultEntry,
} from "@/types";

export const api = {
  vaultExists: () => invoke<boolean>("vault_exists"),
  isUnlocked: () => invoke<boolean>("is_unlocked"),
  createVault: (masterPassword: string) =>
    invoke<void>("create_vault", { masterPassword }),
  unlockVault: (masterPassword: string) =>
    invoke<void>("unlock_vault", { masterPassword }),
  lockVault: () => invoke<void>("lock_vault"),
  setInactivityTimeout: (seconds: number) =>
    invoke<void>("set_inactivity_timeout", { seconds }),

  listEntries: () => invoke<VaultEntry[]>("list_entries"),
  searchVault: (query: string) => invoke<VaultEntry[]>("search_vault", { query }),
  addEntry: (input: EntryInput) => invoke<VaultEntry>("add_entry", { input }),
  getEntry: (id: string) => invoke<VaultEntry>("get_entry", { id }),
  updateEntry: (id: string, input: EntryInput) =>
    invoke<VaultEntry>("update_entry", { id, input }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  listFolders: () => invoke<string[]>("list_folders"),
  listTags: () => invoke<string[]>("list_tags"),

  generatePassword: (options: GeneratePasswordOptions) =>
    invoke<string>("generate_password", { options }),
  copySecret: (text: string) => invoke<void>("copy_secret", { text }),
  checkPasswordBreach: (password: string) =>
    invoke<BreachCheckResult>("check_password_breach", { password }),

  exportVault: (passphrase: string, path: string) =>
    invoke<void>("export_vault", { passphrase, path }),
  importEncryptedBackup: (passphrase: string, path: string) =>
    invoke<VaultEntry[]>("import_encrypted_backup", { passphrase, path }),
  importBitwardenCsv: (path: string) =>
    invoke<VaultEntry[]>("import_bitwarden_csv", { path }),

  biometricStatus: () => invoke<BiometricStatus>("biometric_status"),
  enrollBiometric: () => invoke<void>("enroll_biometric"),
  biometricUnlock: () => invoke<void>("biometric_unlock"),
  disableBiometric: () => invoke<void>("disable_biometric"),
};
