import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PasswordGenerator } from "@/components/PasswordGenerator";
import { StrengthMeter } from "@/components/StrengthMeter";
import { api } from "@/lib/ipc";
import { useUiStore } from "@/store/uiStore";
import type { EntryInput, VaultEntry } from "@/types";

type Props = {
  entry: VaultEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: EntryInput) => Promise<void>;
};

const emptyInput: EntryInput = {
  url: "",
  username: "",
  password: "",
  notes: "",
  folder: "",
  tags: [],
};

export function EntryDialog({ entry, open, onOpenChange, onSave }: Props) {
  const hibpEnabled = useUiStore((state) => state.hibpEnabled);
  const [input, setInput] = useState<EntryInput>(emptyInput);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [breach, setBreach] = useState<string | null>(null);
  const tagsValue = useMemo(() => input.tags.join(", "), [input.tags]);

  useEffect(() => {
    setInput(
      entry
        ? {
            url: entry.url,
            username: entry.username,
            password: entry.password,
            notes: entry.notes,
            folder: entry.folder ?? "",
            tags: entry.tags,
          }
        : emptyInput,
    );
    setBreach(null);
    setShowPassword(false);
  }, [entry, open]);

  function update<K extends keyof EntryInput>(key: K, value: EntryInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setBreach(null);
    try {
      if (hibpEnabled && input.password) {
        const result = await api.checkPasswordBreach(input.password);
        if (result.found) {
          setBreach(
            `This password appears ${result.count.toLocaleString()} times in known breaches.`,
          );
          setBusy(false);
          return;
        }
      }
      await onSave(input);
      toast.success(entry ? "Entry updated" : "Entry added", {
        description: "Encrypted with AES-256-GCM before it touched disk.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not save entry", { description: String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "Add entry"}</DialogTitle>
          <DialogDescription>
            Fields are encrypted in Rust before any database write. Plaintext never hits disk.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-6 lg:grid-cols-[1fr_320px]" onSubmit={submit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entry-url">URL</Label>
              <Input
                id="entry-url"
                autoFocus
                value={input.url}
                onChange={(event) => update("url", event.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-username">Username</Label>
              <Input
                id="entry-username"
                value={input.username}
                onChange={(event) => update("username", event.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="entry-password"
                  className="font-mono"
                  value={input.password}
                  type={showPassword ? "text" : "password"}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder="Stored encrypted at rest"
                />
                <Button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  size="icon"
                  type="button"
                  variant="secondary"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <StrengthMeter password={input.password} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="entry-folder">Folder / category</Label>
                <Input
                  id="entry-folder"
                  value={input.folder ?? ""}
                  onChange={(event) => update("folder", event.target.value)}
                  placeholder="Work"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entry-tags">Tags</Label>
                <Input
                  id="entry-tags"
                  value={tagsValue}
                  onChange={(event) =>
                    update(
                      "tags",
                      event.target.value.split(",").map((tag) => tag.trim()),
                    )
                  }
                  placeholder="prod, admin"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-notes">Notes</Label>
              <Textarea
                id="entry-notes"
                value={input.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Security questions, recovery codes, or local notes"
              />
            </div>
            {input.tags.filter(Boolean).length ? (
              <div className="flex flex-wrap gap-2">
                {input.tags.filter(Boolean).map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
            {breach ? (
              <Alert variant="destructive">
                <ShieldAlert className="size-4" />
                <AlertTitle>Breached password blocked</AlertTitle>
                <AlertDescription>{breach}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={busy || !input.password} type="submit">
                {busy ? <Spinner /> : null}
                {busy ? "Saving" : "Save encrypted entry"}
              </Button>
            </DialogFooter>
          </div>
          <PasswordGenerator onUse={(password) => update("password", password)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
