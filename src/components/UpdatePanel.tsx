import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { DownloadCloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { checkForUpdate, installUpdate, type Update } from "@/lib/updater";

export function UpdatePanel() {
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [available, setAvailable] = useState<Update | null>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  async function onCheck() {
    setChecking(true);
    try {
      const update = await checkForUpdate();
      if (update) {
        setAvailable(update);
        toast.info(`Update available: v${update.version}`);
      } else {
        setAvailable(null);
        toast.success("You're on the latest version");
      }
    } catch (cause) {
      toast.error("Update check failed", { description: String(cause) });
    } finally {
      setChecking(false);
    }
  }

  async function onInstall() {
    if (!available) return;
    setInstalling(true);
    setPct(0);
    try {
      await installUpdate(available, (downloaded, total) => {
        if (total) {
          setPct(Math.min(100, Math.round((downloaded / total) * 100)));
        }
      });
      // The app relaunches automatically once the installer finishes.
    } catch (cause) {
      toast.error("Update failed", { description: String(cause) });
      setInstalling(false);
    }
  }

  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="flex items-start gap-3">
        <DownloadCloud className="mt-0.5 size-5 text-foreground" />
        <div className="space-y-1">
          <Label>Software updates</Label>
          <p className="text-xs text-muted-foreground">
            Manual, signed updates from GitHub Releases. Nothing is sent automatically.
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Current version: <span className="font-mono text-foreground">v{version || "…"}</span>
      </p>

      {available ? (
        <div className="mt-3 space-y-3 rounded-lg border bg-card p-3">
          <p className="text-sm">
            Version <span className="font-mono">v{available.version}</span> is available.
          </p>
          {available.body ? (
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {available.body}
            </p>
          ) : null}
          {installing ? <Progress value={pct} /> : null}
          <Button className="w-full" disabled={installing} onClick={onInstall}>
            {installing ? <Spinner /> : <DownloadCloud className="size-4" />}
            {installing ? `Installing ${pct}%` : "Download & install, then restart"}
          </Button>
        </div>
      ) : (
        <Button
          className="mt-4 w-full"
          disabled={checking}
          variant="secondary"
          onClick={onCheck}
        >
          {checking ? <Spinner /> : <RefreshCw className="size-4" />}
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      )}
    </div>
  );
}
