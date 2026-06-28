import { FormEvent, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StrengthMeter } from "@/components/StrengthMeter";
import { api } from "@/lib/ipc";
import {
  hasWindowsHelloCredential,
  isWindowsHelloAvailable,
  verifyWindowsHello,
} from "@/lib/windowsHello";
import { useAuthStore } from "@/store/authStore";
import type { BiometricStatus } from "@/types";

export function AuthScreen() {
  const { vaultExists, createVault, unlock, unlockWithBiometric, error } = useAuthStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [helloBusy, setHelloBusy] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [helloAvailable, setHelloAvailable] = useState(false);
  const [helloError, setHelloError] = useState<string | null>(null);
  const creating = !vaultExists;
  const mismatch = creating && Boolean(confirm) && password !== confirm;

  useEffect(() => {
    if (!vaultExists) {
      setBiometric(null);
      return;
    }
    Promise.all([api.biometricStatus(), isWindowsHelloAvailable()])
      .then(([status, available]) => {
        setBiometric(status);
        setHelloAvailable(available);
      })
      .catch(() => {
        setBiometric(null);
        setHelloAvailable(false);
      });
  }, [vaultExists]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (creating && password !== confirm) {
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        await createVault(password);
      } else {
        await unlock(password);
      }
      setPassword("");
      setConfirm("");
    } catch {
      // surfaced via store error
    } finally {
      setBusy(false);
    }
  }

  async function onBiometricUnlock() {
    setHelloBusy(true);
    setHelloError(null);
    try {
      const win = getCurrentWindow();
      await win.unminimize();
      await win.show();
      await win.setFocus();
      await verifyWindowsHello();
      await unlockWithBiometric();
    } catch (cause) {
      setHelloError(String(cause));
    } finally {
      setHelloBusy(false);
    }
  }

  const canSubmit = password.length >= 12 && (!creating || password === confirm);
  const showHello =
    !creating && biometric?.enrolled && helloAvailable && hasWindowsHelloCredential();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-10">
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:28px_28px] opacity-40" />
      <div className="relative w-full max-w-md animate-in fade-in-0 zoom-in-95 duration-300">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border bg-card text-foreground shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
            {creating ? <ShieldCheck className="size-7" /> : <Lock className="size-7" />}
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {creating ? "Create your vault" : "Welcome back"}
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {creating
              ? "Your master password is never stored. It derives a local key with Argon2id."
              : "Enter your master password to unlock Aegis."}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="master-password">Master password</Label>
              <Input
                id="master-password"
                autoFocus
                autoComplete={creating ? "new-password" : "current-password"}
                className="h-10"
                minLength={12}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
              />
            </div>
            {creating ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    aria-invalid={mismatch}
                    autoComplete="new-password"
                    className="h-10"
                    minLength={12}
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Repeat master password"
                  />
                </div>
                <StrengthMeter password={password} />
                {mismatch ? (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                ) : null}
              </>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button className="h-10 w-full" disabled={busy || !canSubmit} type="submit">
              {busy ? <Spinner /> : null}
              {busy
                ? creating
                  ? "Creating vault"
                  : "Unlocking"
                : creating
                  ? "Create encrypted vault"
                  : "Unlock vault"}
            </Button>

            {showHello ? (
              <Button
                className="h-10 w-full"
                disabled={helloBusy}
                type="button"
                variant="secondary"
                onClick={onBiometricUnlock}
              >
                {helloBusy ? <Spinner /> : <Fingerprint className="size-4" />}
                {helloBusy ? "Waiting for Windows Hello" : "Unlock with Windows Hello"}
              </Button>
            ) : null}

            {helloError ? (
              <p className="text-center text-xs text-destructive">{helloError}</p>
            ) : null}
          </form>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <KeyRound className="size-3" />
          Local-only · AES-256-GCM · SQLCipher · zero telemetry
        </p>
      </div>
    </main>
  );
}
