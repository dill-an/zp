/**
 * Pure logic for the dashboard, My week, settings and audit pages. No database access;
 * unit tested in dashboard-logic.test.ts.
 */
import { z } from "zod";
import { addDaysISO, APP_TIMEZONE, dueDescription, formatDate, formatDateTime, toHouseDate } from "@/lib/dates";
import { centsToInput, parseDollarsToCents } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidISODate, type AssignmentState } from "@/lib/queries/labor-logic";
import { SETTING_KEYS } from "@/lib/settings-keys";
import { humanize } from "@/lib/utils";

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

/** "due Wed, Oct 21" plus, for open jobs, the relative part: "due Wed, Oct 21 (due in 2 days)". */
export function jobDueParts(dueDate: string, showRelative: boolean, now: Date = new Date()): { base: string; relative: string | null } {
  return { base: `due ${formatDate(dueDate, { weekday: true })}`, relative: showRelative ? dueDescription(dueDate, now) : null };
}

export function jobDueLabel(dueDate: string, showRelative: boolean, now: Date = new Date()): string {
  const { base, relative } = jobDueParts(dueDate, showRelative, now);
  return relative ? `${base} (${relative})` : base;
}

/* ------------------------------------------------------------------ */
/* Labor week status (next week wording, draft notice)                 */
/* ------------------------------------------------------------------ */

export type WeekStatus = { exists: boolean; isPublished: boolean };

/** Empty-state line under "Next week": only a published week can say there is nothing for you. */
export function nextWeekMessage(status: WeekStatus, jobCount: number): string | null {
  if (jobCount > 0) return null;
  return status.exists && status.isPublished ? "No jobs for you next week." : "Nothing posted for next week yet.";
}

/** Officer panel line for a week that is missing or still a draft; null when it is published. */
export function laborWeekNotice(status: WeekStatus, weekStart: string): { text: string; href: string } | null {
  if (!status.exists) return { text: "No week posted yet", href: "/labor" };
  if (!status.isPublished) return { text: `Week of ${formatDate(weekStart)} is a draft, publish it`, href: "/labor?manage=1" };
  return null;
}

/* ------------------------------------------------------------------ */
/* Contact details                                                     */
/* ------------------------------------------------------------------ */

export type ContactField = "phone" | "email";

/** Which of phone and email a member has not filled in (blank or whitespace counts as missing). */
export function missingContactFields(member: { phone: string | null | undefined; email: string | null | undefined }): ContactField[] {
  const out: ContactField[] = [];
  if (!member.phone?.trim()) out.push("phone");
  if (!member.email?.trim()) out.push("email");
  return out;
}

/* ------------------------------------------------------------------ */
/* Board tasks                                                         */
/* ------------------------------------------------------------------ */

/** Open tasks with nobody assigned on the boards of the chairs the viewer holds. */
export function unassignedOnBoards<T extends { chairId: number | null; assignees: readonly unknown[] }>(tasks: readonly T[], chairIds: readonly number[]): T[] {
  if (chairIds.length === 0) return [];
  return tasks.filter((t) => t.chairId != null && chairIds.includes(t.chairId) && t.assignees.length === 0);
}

/* ------------------------------------------------------------------ */
/* Waiting on you                                                      */
/* ------------------------------------------------------------------ */

export const WAITING_WINDOW_DAYS = 7;

/** True when the instant lies in the last `days` days, up to and including now. */
export function withinLastDays(iso: string | null | undefined, now: Date, days = WAITING_WINDOW_DAYS): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t <= now.getTime() && t >= now.getTime() - days * 86_400_000;
}

export type WaitingSwap = {
  id: number;
  status: "pending" | "accepted" | "declined" | "approved" | "cancelled";
  requestedById: number;
  targetMemberId: number | null;
  resolvedAt: string | null;
  createdAt: string;
  jobName: string;
  weekStart: string;
  requesterName: string;
  /** False once the job is done, missed or excused (nothing left to claim). */
  jobOpen: boolean;
};
export type WaitingExcuse = { id: number; status: "pending" | "approved" | "denied"; reviewedAt: string | null; jobName: string; weekStart: string };
export type WaitingSanction = { id: number; reason: string; status: string; issuedAt: string; dueAt: string | null };
export type WaitingTask = { id: number; title: string; assignedAt: string; dueAt: string | null };
export type WaitingDuty = { id: number; eventId: number; eventTitle: string; duty: string; label: string | null; startsAt: string };

export type WaitingInput = {
  memberId: number;
  /** Only brothers in the labor pool can claim an open swap. */
  inLaborPool: boolean;
  swaps: WaitingSwap[];
  excuses: WaitingExcuse[];
  /** Sanctions issued to the member (any status); the window filter is applied here. */
  sanctions: WaitingSanction[];
  /** Open tasks assigned to the member with when they were assigned. */
  tasks: WaitingTask[];
  /** Unfinished duties at events this week. */
  duties: WaitingDuty[];
};

export type WaitingKind = "swap_for_me" | "swap_open" | "swap_decided" | "excuse_decided" | "sanction" | "task" | "duty";
export type WaitingTone = "warning" | "danger" | "info" | "success" | "neutral";
export type WaitingItem = { key: string; kind: WaitingKind; title: string; detail: string; href: string; tone: WaitingTone };

const weekOf = (weekStart: string) => `week of ${formatDate(weekStart)}`;

/**
 * Everything that needs the brother's attention or just happened to them, grouped: things to act on
 * first (swaps asked of them, open swaps, duties, new tasks), then news (sanctions, decisions).
 */
export function buildWaitingItems(input: WaitingInput, now: Date = new Date()): WaitingItem[] {
  const me = input.memberId;
  const items: WaitingItem[] = [];

  for (const s of input.swaps) {
    if (s.status !== "pending" || s.requestedById === me || !s.jobOpen) continue;
    if (s.targetMemberId === me) {
      items.push({ key: `swap-${s.id}`, kind: "swap_for_me", title: `${s.requesterName} asked you to take ${s.jobName}`, detail: `${weekOf(s.weekStart)} · accept or decline on Swaps`, href: "/labor/swaps", tone: "warning" });
    } else if (s.targetMemberId == null && input.inLaborPool) {
      items.push({ key: `swap-${s.id}`, kind: "swap_open", title: `${s.requesterName} needs someone to take ${s.jobName}`, detail: `${weekOf(s.weekStart)} · open to anyone, claim it on Swaps`, href: "/labor/swaps", tone: "info" });
    }
  }

  for (const d of input.duties) {
    items.push({ key: `duty-${d.id}`, kind: "duty", title: `${d.label ?? humanize(d.duty)} at ${d.eventTitle}`, detail: `Event duty this week · ${formatDateTime(d.startsAt)}`, href: `/events/${d.eventId}`, tone: "info" });
  }

  for (const t of input.tasks) {
    if (!withinLastDays(t.assignedAt, now)) continue;
    const due = t.dueAt ? `${formatDate(t.dueAt)} (${dueDescription(t.dueAt, now)})` : "no due date";
    items.push({ key: `task-${t.id}`, kind: "task", title: `New task: ${t.title}`, detail: `Assigned to you ${formatDate(t.assignedAt)} · ${due}`, href: `/tasks/${t.id}`, tone: "info" });
  }

  for (const s of input.sanctions) {
    if (!withinLastDays(s.issuedAt, now)) continue;
    const due = s.dueAt ? `due ${formatDateTime(s.dueAt)}` : "no due date";
    items.push({ key: `sanction-${s.id}`, kind: "sanction", title: `Sanction issued: ${s.reason}`, detail: `${formatDate(s.issuedAt)} · ${due} · ${humanize(s.status)}`, href: `/sanctions/${s.id}`, tone: "danger" });
  }

  for (const s of input.swaps) {
    if (s.requestedById !== me || (s.status !== "approved" && s.status !== "declined") || !withinLastDays(s.resolvedAt, now)) continue;
    items.push({ key: `swap-decided-${s.id}`, kind: "swap_decided", title: `Your swap request for ${s.jobName} was ${s.status}`, detail: `${weekOf(s.weekStart)} · ${formatDate(s.resolvedAt)}`, href: "/labor/me", tone: s.status === "approved" ? "success" : "danger" });
  }

  for (const e of input.excuses) {
    if ((e.status !== "approved" && e.status !== "denied") || !withinLastDays(e.reviewedAt, now)) continue;
    items.push({ key: `excuse-${e.id}`, kind: "excuse_decided", title: `Your excuse for ${e.jobName} was ${e.status}`, detail: `${weekOf(e.weekStart)} · ${formatDate(e.reviewedAt)}`, href: "/labor/me", tone: e.status === "approved" ? "success" : "danger" });
  }

  return items;
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
