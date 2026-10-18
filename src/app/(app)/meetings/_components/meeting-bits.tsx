import { Badge, type Tone } from "@/components/ui";
import type { MeetingKind } from "@/db/schema";
import { APP_TIMEZONE } from "@/lib/dates";
import { MEETING_KIND_LABELS, type AttendanceCounts } from "@/lib/queries/meetings-logic";
import { cn } from "@/lib/utils";

const KIND_TONES: Record<MeetingKind, Tone> = {
  house: "primary",
  chapter: "info",
  exec: "warning",
  new_member: "info",
  committee: "neutral",
  other: "neutral",
};

export function MeetingKindBadge({ kind, className }: { kind: MeetingKind; className?: string }) {
  return (
    <Badge tone={KIND_TONES[kind]} className={className}>
      {MEETING_KIND_LABELS[kind]}
    </Badge>
  );
}

export function MandatoryBadge({ isMandatory }: { isMandatory: boolean }) {
  if (!isMandatory) return null;
  return <Badge tone="danger">Mandatory</Badge>;
}

/** Compact "32 present · 4 absent · 3 excused" line for list rows. */
export function CountsInline({ counts, className }: { counts: AttendanceCounts; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums", className)}>
      <span className="text-success">{counts.present} present</span>
      <span className="text-danger">{counts.absent} absent</span>
      <span className="text-warning">{counts.excused} excused</span>
      {counts.late > 0 ? <span className="text-info">{counts.late} late</span> : null}
    </span>
  );
}

/** Calendar-style date block for list rows (house timezone). */
export function DateBlock({ iso, muted = false }: { iso: string; muted?: boolean }) {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, ...opts }).format(d);
  return (
    <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-md border border-border py-1 leading-tight", muted ? "bg-surface" : "bg-surface-2")} aria-hidden>
      <span className="text-[10px] font-medium uppercase text-muted">{part({ weekday: "short" })}</span>
      <span className="text-lg font-semibold tabular-nums">{part({ day: "numeric" })}</span>
      <span className="text-[10px] font-medium uppercase text-muted">{part({ month: "short" })}</span>
    </div>
  );
}

/** Pills used in the grid cells and summaries. */
export const CELL_CLASSES: Record<string, string> = {
  present: "bg-success-soft text-success",
  absent: "bg-danger-soft text-danger",
  excused: "bg-warning-soft text-warning",
  late: "bg-info-soft text-info",
};
