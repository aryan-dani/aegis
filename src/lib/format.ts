import type { VaultEntry } from "@/types";

export function entryLabel(entry: Pick<VaultEntry, "url" | "username">): string {
  const url = entry.url.trim();
  if (url) {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "");
  }
  return entry.username.trim() || "Untitled entry";
}

export function entryInitials(entry: Pick<VaultEntry, "url" | "username">): string {
  const label = entryLabel(entry);
  const cleaned = label.replace(/[^a-zA-Z0-9]/g, " ").trim();
  if (!cleaned) {
    return "?";
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
