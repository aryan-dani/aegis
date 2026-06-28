import { create } from "zustand";
import { api } from "@/lib/ipc";

type AuthState = {
  initialized: boolean;
  vaultExists: boolean;
  unlocked: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  createVault: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  unlockWithBiometric: () => Promise<void>;
  lock: () => Promise<void>;
  forceLocked: () => void;
};

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const useAuthStore = create<AuthState>((set) => ({
  initialized: false,
  vaultExists: false,
  unlocked: false,
  error: null,
  initialize: async () => {
    try {
      const [vaultExists, unlocked] = await Promise.all([
        api.vaultExists(),
        api.isUnlocked(),
      ]);
      set({ initialized: true, vaultExists, unlocked, error: null });
    } catch (error) {
      set({ initialized: true, error: message(error) });
    }
  },
  createVault: async (password) => {
    try {
      await api.createVault(password);
      set({ vaultExists: true, unlocked: true, error: null });
    } catch (error) {
      set({ error: message(error) });
      throw error;
    }
  },
  unlock: async (password) => {
    try {
      await api.unlockVault(password);
      set({ unlocked: true, vaultExists: true, error: null });
    } catch (error) {
      set({ error: message(error) });
      throw error;
    }
  },
  unlockWithBiometric: async () => {
    try {
      await api.biometricUnlock();
      set({ unlocked: true, vaultExists: true, error: null });
    } catch (error) {
      set({ error: message(error) });
      throw error;
    }
  },
  lock: async () => {
    await api.lockVault();
    set({ unlocked: false });
  },
  forceLocked: () => set({ unlocked: false }),
}));
