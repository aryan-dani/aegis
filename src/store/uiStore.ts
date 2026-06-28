import { create } from "zustand";

type UiState = {
  hibpEnabled: boolean;
  inactivitySeconds: number;
  setHibpEnabled: (enabled: boolean) => void;
  setInactivitySeconds: (seconds: number) => void;
};

export const useUiStore = create<UiState>((set) => ({
  hibpEnabled: false,
  inactivitySeconds: 300,
  setHibpEnabled: (hibpEnabled) => set({ hibpEnabled }),
  setInactivitySeconds: (inactivitySeconds) => set({ inactivitySeconds }),
}));
