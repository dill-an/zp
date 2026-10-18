import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "success" | "warning" | "danger" | "info"; className?: string }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "";
  return (
    <div className={cn("rounded-lg border border-border bg-surface px-4 py-3", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
