import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  Copy,
  Download,
  Fingerprint,
  Folder,
  Import,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Settings,
  Shield,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntryDialog } from "@/components/EntryDialog";
import { SearchBar } from "@/components/SearchBar";
import { UpdatePanel } from "@/components/UpdatePanel";
import { api } from "@/lib/ipc";
import { entryInitials, entryLabel } from "@/lib/format";
import {
  clearWindowsHelloCredential,
  enrollWindowsHello,
  isWindowsHelloAvailable,
} from "@/lib/windowsHello";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { filterEntries, useVaultStore } from "@/store/vaultStore";
import type { BiometricStatus, EntryInput, VaultEntry } from "@/types";

export function VaultScreen() {
  const { lock } = useAuthStore();
  const { entries, folders, tags, loaded, loading, error, load, add, update, remove } =
    useVaultStore();
  const { hibpEnabled, setHibpEnabled, inactivitySeconds, setInactivitySeconds } = useUiStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [helloAvailable, setHelloAvailable] = useState(false);
  const [helloBusy, setHelloBusy] = useState(false);

  useEffect(() => {
    load();
    refreshBiometric().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const visibleEntries = useMemo(
    () => filterEntries(entries, query, folderFilter, tagFilter),
    [entries, query, folderFilter, tagFilter],
  );

  async function onSaveEntry(input: EntryInput) {
    if (editing) {
      await update(editing.id, input);
    } else {
      await add(input);
    }
    setEditing(null);
  }

  async function onDelete(entry: VaultEntry) {
    await remove(entry.id);
    toast.success("Entry deleted", { description: entryLabel(entry) });
  }

  function lockNow() {
    lock();
    useVaultStore.getState().wipe();
    toast.info("Vault locked", { description: "The key was wiped from memory." });
  }

  async function exportBackup() {
    if (exportPassphrase.length < 12) return;
    setExporting(true);
    try {
      const path = await save({
        defaultPath: "aegis-backup.json",
        filters: [{ name: "Aegis encrypted backup", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportVault(exportPassphrase, path);
      setExportPassphrase("");
      toast.success("Encrypted backup exported");
    } catch (cause) {
      toast.error("Export failed", { description: String(cause) });
    } finally {
      setExporting(false);
    }
  }

  async function importBackup() {
    if (backupPassphrase.length < 12) return;
    setImporting(true);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Aegis encrypted backup", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const imported = await api.importEncryptedBackup(backupPassphrase, path);
      setBackupPassphrase("");
      await load();
      toast.success(`Imported ${imported.length} entries`);
    } catch (cause) {
      toast.error("Import failed", { description: String(cause) });
    } finally {
      setImporting(false);
    }
  }

  async function importBitwarden() {
    setImporting(true);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Bitwarden CSV", extensions: ["csv"] }],
      });
      if (typeof path !== "string") return;
      const imported = await api.importBitwardenCsv(path);
      await load();
      toast.success(`Imported ${imported.length} entries from CSV`);
    } catch (cause) {
      toast.error("CSV import failed", { description: String(cause) });
    } finally {
      setImporting(false);
    }
  }

  async function updateTimeout(seconds: number) {
    setInactivitySeconds(seconds);
    await api.setInactivityTimeout(seconds).catch(() => undefined);
  }

  async function refreshBiometric() {
    const [result, available] = await Promise.all([
      api.biometricStatus(),
      isWindowsHelloAvailable(),
    ]);
    setBiometric(result);
    setHelloAvailable(available);
  }

  async function enrollBiometric() {
    setHelloBusy(true);
    try {
      const win = getCurrentWindow();
      await win.unminimize();
      await win.show();
      await win.setFocus();
      await enrollWindowsHello();
      await api.enrollBiometric();
      await refreshBiometric();
      toast.success("Windows Hello enabled");
    } catch (cause) {
      toast.error("Windows Hello enrollment failed", { description: String(cause) });
    } finally {
      setHelloBusy(false);
    }
  }

  async function disableBiometric() {
    setHelloBusy(true);
    try {
      await api.disableBiometric();
      clearWindowsHelloCredential();
      await refreshBiometric();
      toast.success("Windows Hello disabled");
    } catch (cause) {
      toast.error("Could not disable Windows Hello", { description: String(cause) });
    } finally {
      setHelloBusy(false);
    }
  }

  const hasFilters = Boolean(query || folderFilter || tagFilter);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border bg-background text-foreground">
              <Shield className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight tracking-tight">Aegis</h1>
              <p className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "credential" : "credentials"} · local-only
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sheet onOpenChange={(value) => value && refreshBiometric().catch(() => undefined)}>
              <SheetTrigger asChild>
                <Button variant="secondary">
                  <Settings className="size-4" />
                  Settings
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-[440px] flex-col gap-0 border-border bg-card p-0 sm:max-w-[440px]">
                <SheetHeader className="border-b px-6 py-5">
                  <SheetTitle>Security settings</SheetTitle>
                  <SheetDescription>
                    Everything stays local unless breach checks are enabled.
                  </SheetDescription>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="space-y-6 px-6 py-6">
                    <UpdatePanel />

                    <Separator />

                    <div className="flex items-center justify-between rounded-xl border bg-background/50 p-4">
                      <div className="pr-3">
                        <Label>HIBP breach checks</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sends only the first 5 SHA-1 characters of a password.
                        </p>
                      </div>
                      <Switch checked={hibpEnabled} onCheckedChange={setHibpEnabled} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timeout">Auto-lock timeout (seconds)</Label>
                      <Input
                        id="timeout"
                        min={30}
                        type="number"
                        value={inactivitySeconds}
                        onChange={(event) => updateTimeout(Number(event.target.value))}
                      />
                    </div>

                    <Separator />

                    <div className="rounded-xl border bg-background/50 p-4">
                      <div className="flex items-start gap-3">
                        <Fingerprint className="mt-0.5 size-5 text-foreground" />
                        <div className="space-y-1">
                          <Label>Windows Hello unlock</Label>
                          <p className="text-xs text-muted-foreground">
                            Wraps the vault key with Windows DPAPI after a Windows Hello check.
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {helloAvailable
                          ? biometric?.enrolled
                            ? "Enabled for this vault."
                            : "Available — not yet enabled."
                          : "Not available in this window."}
                      </p>
                      <div className="mt-4">
                        {biometric?.enrolled ? (
                          <Button
                            className="w-full"
                            disabled={helloBusy}
                            variant="destructive"
                            onClick={disableBiometric}
                          >
                            {helloBusy ? <Spinner /> : null}
                            Disable Windows Hello
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            disabled={!helloAvailable || helloBusy}
                            onClick={enrollBiometric}
                          >
                            {helloBusy ? <Spinner /> : <Fingerprint className="size-4" />}
                            Enable Windows Hello
                          </Button>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <Tabs defaultValue="export">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="export">Export</TabsTrigger>
                        <TabsTrigger value="backup">Restore</TabsTrigger>
                        <TabsTrigger value="csv">CSV</TabsTrigger>
                      </TabsList>
                      <TabsContent value="export" className="space-y-3 pt-4">
                        <Input
                          type="password"
                          value={exportPassphrase}
                          onChange={(event) => setExportPassphrase(event.target.value)}
                          placeholder="Export passphrase (min 12 chars)"
                        />
                        <Button
                          className="w-full"
                          disabled={exportPassphrase.length < 12 || exporting}
                          onClick={exportBackup}
                        >
                          {exporting ? <Spinner /> : <Download className="size-4" />}
                          Export encrypted backup
                        </Button>
                      </TabsContent>
                      <TabsContent value="backup" className="space-y-3 pt-4">
                        <Input
                          type="password"
                          value={backupPassphrase}
                          onChange={(event) => setBackupPassphrase(event.target.value)}
                          placeholder="Backup passphrase"
                        />
                        <Button
                          className="w-full"
                          disabled={backupPassphrase.length < 12 || importing}
                          onClick={importBackup}
                        >
                          {importing ? <Spinner /> : <Import className="size-4" />}
                          Restore from backup
                        </Button>
                      </TabsContent>
                      <TabsContent value="csv" className="space-y-3 pt-4">
                        <p className="text-xs text-muted-foreground">
                          Parsed and encrypted entirely in Rust.
                        </p>
                        <Button
                          className="w-full"
                          disabled={importing}
                          variant="secondary"
                          onClick={importBitwarden}
                        >
                          {importing ? <Spinner /> : <Import className="size-4" />}
                          Import Bitwarden CSV
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Button onClick={lockNow} title="Lock (Ctrl+Shift+L)" variant="outline">
              <Lock className="size-4" />
              Lock
            </Button>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[248px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-6">
              <div>
                <p className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Folder className="size-3.5" />
                  Folders
                </p>
                <div className="space-y-1">
                  <FilterButton
                    active={!folderFilter}
                    count={entries.length}
                    label="All items"
                    onClick={() => setFolderFilter(null)}
                  />
                  {folders.map((folder) => (
                    <FilterButton
                      active={folderFilter === folder}
                      count={entries.filter((entry) => entry.folder === folder).length}
                      key={folder}
                      label={folder}
                      onClick={() => setFolderFilter(folderFilter === folder ? null : folder)}
                    />
                  ))}
                  {!folders.length ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No folders yet</p>
                  ) : null}
                </div>
              </div>

              {tags.length ? (
                <div>
                  <p className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Tag className="size-3.5" />
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {tags.map((tag) => (
                      <Badge
                        className="cursor-pointer transition-transform active:scale-95"
                        key={tag}
                        variant={tagFilter === tag ? "default" : "secondary"}
                        onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <SearchBar value={query} onChange={setQuery} />
              </div>
              <Button
                className="h-10"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add entry
              </Button>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {loading && !loaded ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-[72px] w-full rounded-xl" />
                ))}
              </div>
            ) : visibleEntries.length ? (
              <ScrollArea className="-mr-3 h-[calc(100vh-220px)] pr-3">
                <div className="space-y-2.5">
                  {visibleEntries.map((entry, index) => (
                    <EntryRow
                      entry={entry}
                      index={index}
                      key={entry.id}
                      onDelete={() => onDelete(entry)}
                      onEdit={() => {
                        setEditing(entry);
                        setDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState hasFilters={hasFilters} onAdd={() => setDialogOpen(true)} />
            )}
          </section>
        </div>
      </div>

      <EntryDialog
        entry={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={onSaveEntry}
      />
    </main>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function EmptyState({ hasFilters, onAdd }: { hasFilters: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center animate-in fade-in-0 zoom-in-95 duration-300">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border bg-card text-muted-foreground">
        <KeyRound className="size-6" />
      </div>
      <p className="text-sm font-medium">
        {hasFilters ? "No matching entries" : "Your vault is empty"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {hasFilters
          ? "Try a different search or clear your filters."
          : "Add your first credential. It is encrypted before it ever touches disk."}
      </p>
      {!hasFilters ? (
        <Button className="mt-5" onClick={onAdd}>
          <Plus className="size-4" />
          Add entry
        </Button>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  index,
  onDelete,
  onEdit,
}: {
  entry: VaultEntry;
  index: number;
  onDelete: () => Promise<void>;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState<"password" | "username" | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function copy(kind: "password" | "username") {
    const value = kind === "password" ? entry.password : entry.username;
    if (!value) return;
    await api.copySecret(value);
    setCopied(kind);
    toast.success(`${kind === "password" ? "Password" : "Username"} copied`, {
      description: "Clipboard clears in 30 seconds.",
    });
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
  }

  return (
    <div
      className="group flex items-center gap-3 rounded-xl border bg-card/60 p-3 transition-all duration-200 hover:border-foreground/25 hover:bg-card animate-in fade-in-0 slide-in-from-bottom-1"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onEdit}
        type="button"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background font-mono text-xs font-semibold text-muted-foreground">
          {entryInitials(entry)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{entryLabel(entry)}</div>
          <div className="truncate text-xs text-muted-foreground">
            {entry.username || "No username"}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {entry.folder ? (
          <Badge className="hidden md:inline-flex" variant="outline">
            {entry.folder}
          </Badge>
        ) : null}
        <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
          {entry.username ? (
            <Button
              aria-label="Copy username"
              size="icon-sm"
              title="Copy username"
              variant="ghost"
              onClick={() => copy("username")}
            >
              {copied === "username" ? <Check className="size-4" /> : <User className="size-4" />}
            </Button>
          ) : null}
          <Button
            aria-label="Copy password"
            size="icon-sm"
            title="Copy password"
            variant="ghost"
            onClick={() => copy("password")}
          >
            {copied === "password" ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
          <Button
            aria-label="Edit entry"
            size="icon-sm"
            title="Edit"
            variant="ghost"
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button aria-label="Delete entry" size="icon-sm" title="Delete" variant="ghost">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  {entryLabel(entry)} will be permanently removed from the vault. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={async (event) => {
                    event.preventDefault();
                    setDeleting(true);
                    try {
                      await onDelete();
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? <Spinner /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
