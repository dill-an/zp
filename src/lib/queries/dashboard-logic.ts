/**
 * Pure logic for the dashboard, My week, settings and audit pages. No database access;
 * unit tested in dashboard-logic.test.ts.
 */
import { z } from "zod";
import { addDaysISO, APP_TIMEZONE, toHouseDate } from "@/lib/dates";
import { centsToInput, parseDollarsToCents } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidISODate, type AssignmentState } from "@/lib/queries/labor-logic";
import { SETTING_KEYS } from "@/lib/settings-keys";

/* ------------------------------------------------------------------ */
/* Greeting and dates                                                  */
/* ------------------------------------------------------------------ */

/** Hour of the day (0-23) in the house timezone. */
export function houseHour(now: Date = new Date()): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hour12: false }).format(now));
  return h === 24 ? 0 : h;
}

export function greeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Saturday that closes the labor week starting on `weekStart`. */
export function weekEnd(weekStart: string): string {
  return addDaysISO(weekStart, 6);
}

/** True when a calendar date or ISO instant falls inside the week (house timezone). */
export function inWeek(value: string | null | undefined, weekStart: string): boolean {
  if (!value) return false;
  const d = toHouseDate(value);
  return d >= weekStart && d <= weekEnd(weekStart);
}

/** Where a task's due instant falls relative to now and the current week. */
export type DueBucket = "overdue" | "this_week" | "later" | "none";

export function dueBucket(dueAt: string | null | undefined, weekStart: string, now: Date = new Date()): DueBucket {
  if (!dueAt) return "none";
  const due = Date.parse(dueAt);
  if (!Number.isNaN(due) && due < now.getTime()) return "overdue";
  return inWeek(dueAt, weekStart) ? "this_week" : "later";
}

export function completionPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/* ------------------------------------------------------------------ */
/* "5 things this week, 2 done"                                         */
/* ------------------------------------------------------------------ */

const DONE_STATES: readonly AssignmentState[] = ["done", "verified", "excused"];

export type WeekSummaryInput = {
  jobs: { state: AssignmentState }[];
  tasks: { bucket: DueBucket }[];
  duties: { done: boolean }[];
  meetings: { attended: boolean }[];
};

export type WeekSummary = { total: number; done: number; label: string };

/** Counts everything on a brother's plate this week: labor jobs, tasks due (or overdue), duties and meetings. */
export function weekSummary(input: WeekSummaryInput): WeekSummary {
  const tasks = input.tasks.filter((t) => t.bucket === "overdue" || t.bucket === "this_week");
  const total = input.jobs.length + tasks.length + input.duties.length + input.meetings.length;
  const done = input.jobs.filter((j) => DONE_STATES.includes(j.state)).length + input.duties.filter((d) => d.done).length + input.meetings.filter((m) => m.attended).length;
  const label = `${total} ${total === 1 ? "thing" : "things"} this week, ${done} done`;
  return { total, done, label };
}

/* ------------------------------------------------------------------ */
/* Denied notice                                                       */
/* ------------------------------------------------------------------ */

/** Message for `/dashboard?denied=<permission>`; unknown values get a generic line. */
export function deniedMessage(denied: string | string[] | undefined): string | null {
  const value = Array.isArray(denied) ? denied[0] : denied;
  if (!value) return null;
  const known = (PERMISSIONS as readonly string[]).includes(value);
  return `You do not have access to ${known ? value : "that page"}.`;
}

/* ------------------------------------------------------------------ */
/* Audit log paging                                                    */
/* ------------------------------------------------------------------ */

export const AUDIT_PAGE_SIZE = 50;

export type AuditParams = { actorId: number | null; entity: string; q: string; page: number };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseAuditParams(sp: Record<string, string | string[] | undefined>): AuditParams {
  const actor = one(sp.actor).trim();
  const page = Number(one(sp.page));
  return {
    actorId: /^\d+$/.test(actor) ? Number(actor) : null,
    entity: one(sp.entity).trim().slice(0, 60),
    q: one(sp.q).trim().slice(0, 120),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function pageCount(total: number, perPage = AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** `/settings/audit?...` for the same filters on another page. */
export function auditHref(params: AuditParams, page = params.page): string {
  const qs = new URLSearchParams();
  if (params.actorId != null) qs.set("actor", String(params.actorId));
  if (params.entity) qs.set("entity", params.entity);
  if (params.q) qs.set("q", params.q);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/settings/audit?${s}` : "/settings/audit";
}

/* ------------------------------------------------------------------ */
/* House settings form                                                 */
/* ------------------------------------------------------------------ */

export const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
] as const;

const dollars = z
  .string()
  .trim()
  .refine((v) => {
    const cents = parseDollarsToCents(v);
    return cents != null && cents >= 0;
  }, "Enter a dollar amount like 25 or 12.50.");

export const houseSettingsSchema = z.object({
  orgName: z.string().trim().min(1, "This field is required.").max(80, "Keep it under 80 characters."),
  chapterName: z.string().trim().min(1, "This field is required.").max(80, "Keep it under 80 characters."),
  semesterLabel: z.string().trim().min(1, "This field is required.").max(40, "Keep it under 40 characters."),
  laborTrackingStart: z.string().trim().refine(isValidISODate, "Enter a date as YYYY-MM-DD."),
  venmoHandle: z.string().trim().max(60, "Keep it under 60 characters.").optional(),
  houseMeetingDay: z.coerce.number().int().min(0).max(6),
  houseMeetingTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM (24 hour)."),
  missedCleanFine: dollars,
  missedMeetingFine: dollars,
});

export type HouseSettingsInput = z.infer<typeof houseSettingsSchema>;
export type HouseSettingsForm = Record<keyof HouseSettingsInput, string>;

/** Stored settings -> what the form shows (cents become dollars). */
export function settingsToForm(settings: Record<string, string>): HouseSettingsForm {
  const get = (key: string) => settings[key] ?? "";
  const cents = (key: string) => centsToInput(Number(get(key)) || 0);
  return {
    orgName: get(SETTING_KEYS.orgName),
    chapterName: get(SETTING_KEYS.chapterName),
    semesterLabel: get(SETTING_KEYS.semesterLabel),
    laborTrackingStart: get(SETTING_KEYS.laborTrackingStart),
    venmoHandle: get(SETTING_KEYS.venmoHandle),
    houseMeetingDay: get(SETTING_KEYS.houseMeetingDay) || "0",
    houseMeetingTime: get(SETTING_KEYS.houseMeetingTime) || "19:00",
    missedCleanFine: cents(SETTING_KEYS.missedCleanFineCents),
    missedMeetingFine: cents(SETTING_KEYS.missedMeetingFineCents),
  };
}

/** Parsed form -> setting key/value pairs ready for setSetting. */
export function formToSettings(input: HouseSettingsInput): Record<string, string> {
  const venmo = (input.venmoHandle ?? "").replace(/^@+/, "").trim();
  return {
    [SETTING_KEYS.orgName]: input.orgName,
    [SETTING_KEYS.chapterName]: input.chapterName,
    [SETTING_KEYS.semesterLabel]: input.semesterLabel,
    [SETTING_KEYS.laborTrackingStart]: input.laborTrackingStart,
    [SETTING_KEYS.venmoHandle]: venmo,
    [SETTING_KEYS.houseMeetingDay]: String(input.houseMeetingDay),
    [SETTING_KEYS.houseMeetingTime]: input.houseMeetingTime,
    [SETTING_KEYS.missedCleanFineCents]: String(parseDollarsToCents(input.missedCleanFine) ?? 0),
    [SETTING_KEYS.missedMeetingFineCents]: String(parseDollarsToCents(input.missedMeetingFine) ?? 0),
  };
}

/** Keys whose stored value differs from the submitted one. */
export function changedSettingKeys(before: Record<string, string>, next: Record<string, string>): string[] {
  return Object.keys(next).filter((k) => (before[k] ?? "") !== next[k]);
}

/** "zp-house-2026-10-18.sqlite" */
export function backupFilename(today: string): string {
  return `zp-house-${today}.sqlite`;
}
