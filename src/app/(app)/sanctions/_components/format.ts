import type { Tone } from "@/components/ui/badge";
import { dueDescription, formatDate, formatDateTime, isoToLocalInput } from "@/lib/dates";

/** Calendar date ("YYYY-MM-DD", house timezone) of an ISO instant. */
export function instantToDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const local = isoToLocalInput(iso);
  return local ? local.slice(0, 10) : "";
}

/** "Oct 18" for an instant, in the house timezone. */
export function formatInstantDate(iso: string | null | undefined, year = false): string {
  const d = instantToDate(iso);
  return d ? formatDate(d, { year }) : "";
}

/** "Sun, Oct 18 at 7:00 PM" plus "due in 2 days" style hint. */
export function describeDue(iso: string | null | undefined, now: Date = new Date()): { when: string; hint: string } {
  if (!iso) return { when: "No due date", hint: "" };
  return { when: formatDateTime(iso), hint: dueDescription(instantToDate(iso), now) };
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  missed_clean: "Missed clean",
  missed_meeting: "Missed meeting",
  late_dues: "Late dues",
  conduct: "Conduct",
  other: "Other",
};

export const SOURCE_TONES: Record<string, Tone> = {
  manual: "neutral",
  missed_clean: "info",
  missed_meeting: "warning",
  late_dues: "primary",
  conduct: "danger",
  other: "neutral",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Done, to verify",
  verified: "Verified",
  waived: "Waived",
  appealed: "Appealed",
};
