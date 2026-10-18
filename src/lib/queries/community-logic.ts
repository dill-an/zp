/**
 * Pure helpers for the community module (events calendar, announcements, maintenance).
 * No database or server-only imports, so everything here runs in vitest.
 */
import { parseISO } from "date-fns";
import {
  ANNOUNCEMENT_AUDIENCES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  RSVP_STATUSES,
} from "@/db/schema";
import { addDaysISO, dayOfWeek, formatDateTime, todayISO } from "@/lib/dates";
import { isOfficer, type CurrentUser } from "@/lib/permissions";

export type Audience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const EVENT_TABS = ["upcoming", "past"] as const;
export type EventTab = (typeof EVENT_TABS)[number];

export const MAINTENANCE_TABS = ["open", "in_progress", "resolved"] as const;
export type MaintenanceTab = (typeof MAINTENANCE_TABS)[number];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/** "2026-10" for a 1-based month. */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/** Parse a "YYYY-MM" query value; null when missing or malformed. */
export function parseMonthKey(key: string | string[] | null | undefined): { year: number; month: number } | null {
  const value = Array.isArray(key) ? key[0] : key;
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 1970 || year > 2100) return null;
  return { year, month };
}

/** The current month in the house timezone. */
export function currentMonth(now: Date = new Date()): { year: number; month: number } {
  const today = todayISO(now);
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** Move a (year, month) pair by `delta` months (negative allowed). */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 + 1 };
}

/** "October 2026" */
export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Weeks covering a month as rows of 7 "YYYY-MM-DD" strings, Sunday first.
 * Leading and trailing days from the neighbouring months fill the first and last rows.
 */
export function monthGrid(year: number, month: number): string[][] {
  const first = `${year}-${pad2(month)}-01`;
  const last = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const start = addDaysISO(first, -dayOfWeek(first));
  const end = addDaysISO(last, 6 - dayOfWeek(last));
  const weeks: string[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDaysISO(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Is a "YYYY-MM-DD" date inside the given month? */
export function inMonth(date: string, year: number, month: number): boolean {
  return date.slice(0, 7) === monthKey(year, month);
}

/** The house-timezone calendar date ("YYYY-MM-DD") of an ISO instant. */
export function houseDate(iso: string): string {
  return todayISO(parseISO(iso));
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** An event is past once it has ended (or started, when it has no end). */
export function eventIsPast(event: { startsAt: string; endsAt: string | null }, now: Date = new Date()): boolean {
  const endIso = event.endsAt ?? event.startsAt;
  return parseISO(endIso).getTime() < now.getTime();
}

export function eventTab(event: { startsAt: string; endsAt: string | null }, now: Date = new Date()): EventTab {
  return eventIsPast(event, now) ? "past" : "upcoming";
}

/** "Fri, Nov 20 at 7:00 PM to 11:00 PM", or both full stamps when the event spans days. */
export function formatEventRange(startsAt: string, endsAt: string | null | undefined): string {
  const start = formatDateTime(startsAt);
  if (!endsAt) return start;
  const end = formatDateTime(endsAt);
  if (houseDate(startsAt) === houseDate(endsAt)) {
    const endTime = end.split(" at ")[1] ?? end;
    return `${start} to ${endTime}`;
  }
  return `${start} to ${end}`;
}

export type RsvpCounts = { going: number; maybe: number; notGoing: number; guests: number };

/** Tally RSVPs; `guests` counts only the extra guests of people who are going. */
export function rsvpCounts(rsvps: { status: RsvpStatus; guests: number }[]): RsvpCounts {
  const counts: RsvpCounts = { going: 0, maybe: 0, notGoing: 0, guests: 0 };
  for (const r of rsvps) {
    if (r.status === "going") {
      counts.going++;
      counts.guests += Math.max(0, r.guests);
    } else if (r.status === "maybe") counts.maybe++;
    else counts.notGoing++;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export type AnnouncementViewer = Pick<CurrentUser, "role" | "chairSlugs" | "status" | "livesInHouse">;

/** Expiry is a calendar date; the announcement stays visible through that day. */
export function announcementExpired(a: { expiresAt: string | null }, now: Date = new Date()): boolean {
  if (!a.expiresAt) return false;
  return a.expiresAt.slice(0, 10) < todayISO(now);
}

/** Does an audience include this viewer? Officers are admins, officer-role members and chair holders. */
export function audienceApplies(audience: Audience, viewer: AnnouncementViewer): boolean {
  switch (audience) {
    case "all":
      return true;
    case "officers":
      return isOfficer(viewer as CurrentUser);
    case "new_members":
      return viewer.status === "new_member";
    case "live_in":
      return viewer.livesInHouse;
  }
}

/** Visible when the audience applies to the viewer and the announcement has not expired. */
export function announcementVisible(
  a: { audience: Audience; expiresAt: string | null },
  viewer: AnnouncementViewer,
  now: Date = new Date(),
): boolean {
  if (announcementExpired(a, now)) return false;
  return audienceApplies(a.audience, viewer);
}

/** Split a body into paragraphs (blank line separated), each a list of lines. */
export function bodyParagraphs(body: string): string[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((l) => l.trimEnd()))
    .filter((lines) => lines.some((l) => l.trim().length > 0));
}

/** Short label for an audience. */
export function audienceLabel(audience: Audience): string {
  switch (audience) {
    case "all":
      return "Everyone";
    case "officers":
      return "Officers";
    case "new_members":
      return "New members";
    case "live_in":
      return "Live-in brothers";
  }
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

/** Which list tab a request belongs to; wont_fix shows under Resolved. */
export function maintenanceTab(status: MaintenanceStatus): MaintenanceTab {
  if (status === "open") return "open";
  if (status === "in_progress") return "in_progress";
  return "resolved";
}

export function maintenanceStatusesForTab(tab: MaintenanceTab): MaintenanceStatus[] {
  if (tab === "resolved") return ["resolved", "wont_fix"];
  return [tab];
}

/** Higher number = more urgent. */
export function priorityRank(priority: MaintenancePriority): number {
  return MAINTENANCE_PRIORITIES.indexOf(priority);
}

export function isResolvedStatus(status: MaintenanceStatus): boolean {
  return status === "resolved" || status === "wont_fix";
}

/* ------------------------------------------------------------------ */
/* Relative time                                                       */
/* ------------------------------------------------------------------ */

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Days between two "YYYY-MM-DD" dates (b - a). */
function calendarDaysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * "just now", "5 minutes ago", "3 hours ago", "3 days ago", "2 weeks ago", "4 months ago", "in 2 days".
 * Under a day uses elapsed time; from a day on uses calendar days in the house timezone.
 */
export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = parseISO(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = now.getTime() - then.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60_000);
  const hours = Math.floor(minutes / 60);
  let label: string;
  if (abs < 45_000) return "just now";
  if (minutes < 60) label = plural(Math.max(1, minutes), "minute");
  else if (hours < 24) label = plural(hours, "hour");
  else {
    const [earlier, later] = future ? [now, then] : [then, now];
    const days = Math.max(1, calendarDaysBetween(todayISO(earlier), todayISO(later)));
    if (days < 7) label = plural(days, "day");
    else if (days < 30) label = plural(Math.floor(days / 7), "week");
    else if (days < 365) label = plural(Math.floor(days / 30), "month");
    else label = plural(Math.floor(days / 365), "year");
  }
  return future ? `in ${label}` : `${label} ago`;
}
