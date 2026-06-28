import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthScreen } from "@/screens/AuthScreen";
import { VaultScreen } from "@/screens/VaultScreen";
import { useAuthStore } from "@/store/authStore";
import { useVaultStore } from "@/store/vaultStore";

function App() {
  const { initialized, unlocked, initialize, forceLocked } = useAuthStore();

  useEffect(() => {
    initialize();
    getCurrentWindow().setContentProtected(true).catch(() => undefined);
    const unlisten = listen<string>("vault-locked", (event) => {
      forceLocked();
      useVaultStore.getState().wipe();
      if (event.payload === "inactivity") {
        toast.info("Vault auto-locked", {
          description: "Inactivity timeout reached. The key was wiped from memory.",
        });
      }
    });
    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [forceLocked, initialize]);

  return (
    <TooltipProvider delayDuration={200}>
      {initialized ? (
        <div
          key={unlocked ? "vault" : "auth"}
          className="animate-in fade-in-0 duration-300"
        >
          {unlocked ? <VaultScreen /> : <AuthScreen />}
        </div>
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="size-1.5 animate-pulse rounded-full bg-foreground/60" />
            Initializing local vault
          </div>
        </div>
      )}
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
