import { Badge, type Tone } from "./badge";
import { humanize } from "@/lib/utils";

/** Maps every status string used in the schema to a color tone. */
export const STATUS_TONES: Record<string, Tone> = {
  // tasks
  todo: "neutral",
  in_progress: "info",
  blocked: "warning",
  done: "success",
  cancelled: "neutral",
  // assignments / duties
  assigned: "info",
  missed: "danger",
  excused: "warning",
  swapped: "neutral",
  // sanctions
  open: "warning",
  completed: "info",
  verified: "success",
  waived: "neutral",
  appealed: "warning",
  // attendance
  present: "success",
  absent: "danger",
  late: "warning",
  // members
  active: "success",
  new_member: "info",
  abroad: "warning",
  inactive: "neutral",
  alumni: "neutral",
  // roles
  admin: "primary",
  officer: "info",
  member: "neutral",
  // labor groups
  cooks: "warning",
  cleans: "info",
  none: "neutral",
  // priority
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
  // generic
  pending: "warning",
  approved: "success",
  accepted: "success",
  denied: "danger",
  declined: "danger",
  resolved: "success",
  wont_fix: "neutral",
  proposed: "info",
  defaulted: "danger",
  paid: "success",
  overdue: "danger",
  partial: "warning",
  going: "success",
  maybe: "warning",
  not_going: "neutral",
};

export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} className={className}>
      {label ?? humanize(status)}
    </Badge>
  );
}
