import { Badge, type Tone } from "@/components/ui";
import { humanize } from "@/lib/utils";

const KIND_TONES: Record<string, Tone> = {
  social: "primary",
  rush: "info",
  philanthropy: "success",
  brotherhood: "warning",
  alumni: "neutral",
  chapter: "danger",
  athletics: "info",
  other: "neutral",
};

const DUTY_TONES: Record<string, Tone> = {
  sober_monitor: "danger",
  setup: "info",
  cleanup: "warning",
  door: "primary",
  driver: "success",
  other: "neutral",
};

/** Event kind pill (kinds are not statuses, so they have their own tones). */
export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  return (
    <Badge tone={KIND_TONES[kind] ?? "neutral"} className={className}>
      {humanize(kind)}
    </Badge>
  );
}

export function DutyBadge({ duty, className }: { duty: string; className?: string }) {
  return (
    <Badge tone={DUTY_TONES[duty] ?? "neutral"} className={className}>
      {humanize(duty)}
    </Badge>
  );
}

export function MandatoryBadge({ className }: { className?: string }) {
  return (
    <Badge tone="danger" className={className}>
      Mandatory
    </Badge>
  );
}
