import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCents } from "@/lib/money";
import { statusLabel, type DuesStatus } from "@/lib/queries/dues-logic";
import { cn } from "@/lib/utils";
import { KIND_TONES, kindLabel } from "./constants";

/** Status pill with the dues wording ("Nothing due" instead of "None"). */
export function DuesStatusPill({ status, className }: { status: DuesStatus; className?: string }) {
  return <StatusPill status={status} label={statusLabel(status)} className={className} />;
}

export function KindBadge({ kind }: { kind: string }) {
  return <Badge tone={KIND_TONES[kind] ?? "neutral"}>{kindLabel(kind)}</Badge>;
}

/** Money with a sign and tone: positive amounts are owed (plain), negative amounts are credits (green). */
export function Money({ cents, signed = false, className }: { cents: number; signed?: boolean; className?: string }) {
  const tone = cents < 0 ? "text-success" : "";
  return <span className={cn("tabular-nums", tone, className)}>{formatCents(cents, { showPlus: signed })}</span>;
}

/** A balance: what the member owes (red when positive, green when they have credit). */
export function Balance({ cents, className }: { cents: number; className?: string }) {
  const tone = cents > 0 ? "text-danger" : cents < 0 ? "text-success" : "text-muted";
  return (
    <span className={cn("font-medium tabular-nums", tone, className)}>
      {cents < 0 ? `${formatCents(-cents)} credit` : formatCents(cents)}
    </span>
  );
}
