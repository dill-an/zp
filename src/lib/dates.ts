/**
 * Date helpers. The house lives in one timezone (APP_TIMEZONE, default America/New_York);
 * calendar dates are "YYYY-MM-DD" strings and instants are ISO strings in UTC.
 */
import { addDays, format, parseISO } from "date-fns";

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/New_York";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "YYYY-MM-DD" for the current moment in the house timezone. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current instant as an ISO string. */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Parse "YYYY-MM-DD" into a Date at local midnight (safe for arithmetic on calendar days). */
export function parseDateOnly(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function addDaysISO(date: string, days: number): string {
  return toDateOnly(addDays(parseDateOnly(date), days));
}

/** 0 = Sunday ... 6 = Saturday for a calendar date. */
export function dayOfWeek(date: string): number {
  return parseDateOnly(date).getDay();
}

/** The Sunday that starts the labor week containing `date`. */
export function weekStartFor(date: string): string {
  return addDaysISO(date, -dayOfWeek(date));
}

/** Current labor week's Sunday. */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartFor(todayISO(now));
}

/** Compare two "YYYY-MM-DD" strings: negative if a < b. */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dayName(dow: number, short = false): string {
  return short ? DAY_SHORT[((dow % 7) + 7) % 7] : DAY_NAMES[((dow % 7) + 7) % 7];
}

/** "Oct 18" / "Oct 18, 2026" */
export function formatDate(date: string | null | undefined, opts: { year?: boolean; weekday?: boolean } = {}): string {
  if (!date) return "";
  const d = date.length === 10 ? parseDateOnly(date) : parseISO(date);
  const parts: string[] = [];
  if (opts.weekday) parts.push(format(d, "EEE"));
  parts.push(format(d, opts.year ? "MMM d, yyyy" : "MMM d"));
  return parts.join(", ");
}

/** "Sun, Oct 18 at 7:00 PM" in the house timezone. */
export function formatDateTime(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "";
  const d = parseISO(iso);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `${datePart} at ${timePart}`;
}

/** "9/20" style short label used on the labor grid. */
export function formatShortDate(date: string): string {
  const d = parseDateOnly(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Label for a labor week: "Week of Sep 20". */
export function weekLabel(weekStart: string, withYear = false): string {
  return `Week of ${formatDate(weekStart, { year: withYear })}`;
}

/** Convert a datetime-local form value (house timezone) to a UTC ISO string. */
export function localInputToISO(value: string): string | null {
  if (!value) return null;
  // value is "YYYY-MM-DDTHH:mm" interpreted in APP_TIMEZONE.
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  // Find the UTC instant whose wall-clock in APP_TIMEZONE equals the input by probing the offset.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMinutes = tzOffsetMinutes(new Date(guess));
  const corrected = guess - offsetMinutes * 60_000;
  // Re-check offset in case the correction crossed a DST boundary.
  const offset2 = tzOffsetMinutes(new Date(corrected));
  return new Date(guess - offset2 * 60_000).toISOString();
}

/** Convert a UTC ISO string into a "YYYY-MM-DDTHH:mm" value for datetime-local inputs. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Offset of APP_TIMEZONE from UTC in minutes at the given instant (e.g. -240 for EDT). */
export function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** ISO date for a calendar date at a given local time ("19:00") in the house timezone. */
export function dateAtLocalTime(date: string, time = "19:00"): string {
  return localInputToISO(`${date}T${time}`) ?? new Date().toISOString();
}

/** Is the given ISO instant in the past? */
export function isPast(iso: string | null | undefined, now: Date = new Date()): boolean {
  return !!iso && parseISO(iso).getTime() < now.getTime();
}

/** Relative description for a due date: "due today", "3 days overdue", "due in 2 days". */
export function dueDescription(date: string | null | undefined, now: Date = new Date()): string {
  if (!date) return "";
  const today = parseDateOnly(todayISO(now));
  const due = parseDateOnly(date.slice(0, 10));
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  if (diff === -1) return "1 day overdue";
  if (diff < 0) return `${-diff} days overdue`;
  return `due in ${diff} days`;
}
