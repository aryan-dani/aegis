import { useEffect, useState } from "react";
import { Check, Copy, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/ipc";
import type { GeneratePasswordOptions } from "@/types";

type Props = {
  onUse: (password: string) => void;
};

export function PasswordGenerator({ onUse }: Props) {
  const [options, setOptions] = useState<GeneratePasswordOptions>({
    length: 24,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [generated, setGenerated] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      setGenerated(await api.generatePassword(options));
    } catch (error) {
      toast.error("Could not generate password", { description: String(error) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!generated) return;
    await api.copySecret(generated);
    setCopied(true);
    toast.success("Copied to clipboard", { description: "Clears automatically in 30 seconds." });
    window.setTimeout(() => setCopied(false), 1500);
  }

  function update<K extends keyof GeneratePasswordOptions>(
    key: K,
    value: GeneratePasswordOptions[K],
  ) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card className="bg-background/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Password generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="generator-length">Length</Label>
            <span className="font-mono text-sm text-muted-foreground">{options.length}</span>
          </div>
          <input
            id="generator-length"
            className="w-full accent-foreground"
            max={64}
            min={8}
            type="range"
            value={options.length}
            onChange={(event) => update("length", Number(event.target.value))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(["lowercase", "uppercase", "numbers", "symbols"] as const).map((key) => (
            <label
              className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-accent"
              key={key}
            >
              <span className="capitalize">{key}</span>
              <Switch checked={options[key]} onCheckedChange={(checked) => update(key, checked)} />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            readOnly
            className="h-9 font-mono"
            value={generated}
            placeholder="Generated password"
          />
          <Button
            aria-label="Copy generated password"
            className="h-9"
            size="icon"
            type="button"
            variant="secondary"
            onClick={copy}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
          <Button
            aria-label="Regenerate"
            className="h-9"
            disabled={busy}
            size="icon"
            type="button"
            variant="secondary"
            onClick={generate}
          >
            {busy ? <Spinner /> : <RefreshCcw className="size-4" />}
          </Button>
        </div>
        <Button
          className="w-full"
          disabled={!generated}
          type="button"
          onClick={() => onUse(generated)}
        >
          Use this password
        </Button>
      </CardContent>
    </Card>
  );
}
