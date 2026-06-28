import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/strength";

export function StrengthMeter({ password }: { password: string }) {
  const strength = useMemo(() => passwordStrength(password), [password]);
  const filled = password ? strength.score + 1 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-muted transition-colors duration-300",
              index < filled && "bg-foreground",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{strength.label}</span>
        {strength.warning ? <span className="truncate pl-2">{strength.warning}</span> : null}
      </div>
    </div>
  );
}
