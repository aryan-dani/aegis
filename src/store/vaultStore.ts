import { create } from "zustand";
import { api } from "@/lib/ipc";
import type { EntryInput, VaultEntry } from "@/types";

type VaultState = {
  entries: VaultEntry[];
  folders: string[];
  tags: string[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (input: EntryInput) => Promise<VaultEntry>;
  update: (id: string, input: EntryInput) => Promise<VaultEntry>;
  remove: (id: string) => Promise<void>;
  wipe: () => void;
};

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function deriveFacets(entries: VaultEntry[]) {
  return {
    folders: Array.from(
      new Set(entries.map((entry) => entry.folder).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(new Set(entries.flatMap((entry) => entry.tags))).sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export const useVaultStore = create<VaultState>((set, get) => ({
  entries: [],
  folders: [],
  tags: [],
  loaded: false,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await api.listEntries();
      set({ entries, ...deriveFacets(entries), loaded: true, loading: false });
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  add: async (input) => {
    const entry = await api.addEntry(input);
    await get().load();
    return entry;
  },
  update: async (id, input) => {
    const entry = await api.updateEntry(id, input);
    await get().load();
    return entry;
  },
  remove: async (id) => {
    await api.deleteEntry(id);
    await get().load();
  },
  wipe: () =>
    set({
      entries: [],
      folders: [],
      tags: [],
      loaded: false,
      loading: false,
      error: null,
    }),
}));

export function filterEntries(
  entries: VaultEntry[],
  query: string,
  folder: string | null,
  tag: string | null,
): VaultEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (folder && entry.folder !== folder) {
      return false;
    }
    if (tag && !entry.tags.includes(tag)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return (
      entry.url.toLowerCase().includes(needle) ||
      entry.username.toLowerCase().includes(needle) ||
      entry.notes.toLowerCase().includes(needle) ||
      (entry.folder ?? "").toLowerCase().includes(needle) ||
      entry.tags.some((value) => value.toLowerCase().includes(needle))
    );
  });
}
