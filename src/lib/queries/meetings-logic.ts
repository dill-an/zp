/**
 * Pure meeting/attendance logic (no db, no server-only) so it can be unit tested.
 */
import type { AttendanceStatus, MeetingKind } from "@/db/schema";
import { addDaysISO, compareDates, dayOfWeek, formatDate, isoToLocalInput } from "@/lib/dates";

export type AttendanceCounts = { present: number; absent: number; excused: number; late: number; total: number };

export const ATTENDANCE_LETTERS: Record<AttendanceStatus, string> = { present: "P", absent: "A", excused: "E", late: "L" };

export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  house: "House",
  chapter: "Chapter",
  exec: "Exec",
  new_member: "New member",
  committee: "Committee",
  other: "Other",
};

/** Count statuses. `total` is the number of rows. */
export function attendanceSummary(rows: { status: AttendanceStatus }[]): AttendanceCounts {
  const out: AttendanceCounts = { present: 0, absent: 0, excused: 0, late: 0, total: 0 };
  for (const r of rows) {
    if (r.status in out) out[r.status] += 1;
    out.total += 1;
  }
  return out;
}

/**
 * Attendance rate as a whole percentage 0..100. Late counts as attended; excused absences
 * do not count against the member. When nothing counts (no rows, or only excused) the rate is 100.
 */
export function attendanceRate(summary: Pick<AttendanceCounts, "present" | "absent" | "late">): number {
  const counted = summary.present + summary.late + summary.absent;
  if (counted === 0) return 100;
  return Math.round(((summary.present + summary.late) / counted) * 100);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Upper bound on generated dates so a typo in the last date cannot create thousands of meetings. */
export const MAX_SERIES_LENGTH = 60;

/**
 * Every date on `weekday` (0 = Sunday) from `first` through `last` inclusive, as "YYYY-MM-DD".
 * The first date is the first `weekday` on or after `first`. Capped at MAX_SERIES_LENGTH entries.
 */
export function weeklySeries(first: string, last: string, weekday: number): string[] {
  if (!DATE_RE.test(first) || !DATE_RE.test(last)) return [];
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return [];
  if (compareDates(last, first) < 0) return [];
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  let date = addDaysISO(first, offset);
  const out: string[] = [];
  while (compareDates(date, last) <= 0 && out.length < MAX_SERIES_LENGTH) {
    out.push(date);
    date = addDaysISO(date, 7);
  }
  return out;
}

/** Calendar date ("YYYY-MM-DD", house timezone) of a meeting instant. */
export function meetingDateOnly(scheduledAt: string): string {
  return isoToLocalInput(scheduledAt).slice(0, 10);
}

/** Description used on fine charges and sanctions: "Missed House Meeting (Oct 11, 2026)". */
export function fineDescription(title: string, scheduledAt: string): string {
  return `Missed ${title} (${formatDate(meetingDateOnly(scheduledAt), { year: true })})`;
}

/**
 * Member ids that were marked absent and do not already have a charge whose description
 * matches this meeting's fine description. Order follows the attendance rows; no duplicates.
 */
export function absenteesForFines(
  attendanceRows: { memberId: number; status: AttendanceStatus }[],
  existingChargeDescriptions: { memberId: number; description: string }[],
  description: string,
): number[] {
  const fined = new Set(existingChargeDescriptions.filter((c) => c.description === description).map((c) => c.memberId));
  const out: number[] = [];
  for (const row of attendanceRows) {
    if (row.status !== "absent") continue;
    if (fined.has(row.memberId) || out.includes(row.memberId)) continue;
    out.push(row.memberId);
  }
  return out;
}

/** Default status on the take-attendance sheet: existing record, else approved excuse, else absent. */
export function defaultAttendanceStatus(existing: AttendanceStatus | null | undefined, hasApprovedExcuse: boolean): AttendanceStatus {
  if (existing) return existing;
  return hasApprovedExcuse ? "excused" : "absent";
}

/** Split free text into paragraphs (blank-line separated), trimming and dropping empties. */
export function splitParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Grouping and the semester grid                                      */
/* ------------------------------------------------------------------ */

export type ClassRef = { id: number; name: string; sortOrder: number } | null;
export type MemberLite = { id: number; firstName: string; lastName: string; preferredName: string; status: string; pledgeClass: ClassRef };

export const NO_CLASS_LABEL = "No pledge class";

export function compareMembers(a: Pick<MemberLite, "firstName" | "lastName">, b: Pick<MemberLite, "firstName" | "lastName">): number {
  return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
}

/** Group items that carry a member by that member's pledge class, oldest class first, unassigned last. */
export function groupByClass<T>(items: T[], memberOf: (item: T) => MemberLite): { label: string; classId: number | null; items: T[] }[] {
  const groups = new Map<number | null, { label: string; classId: number | null; sortOrder: number; items: T[] }>();
  for (const item of items) {
    const m = memberOf(item);
    const key = m.pledgeClass?.id ?? null;
    let g = groups.get(key);
    if (!g) {
      g = { label: m.pledgeClass?.name ?? NO_CLASS_LABEL, classId: key, sortOrder: m.pledgeClass?.sortOrder ?? Number.MAX_SAFE_INTEGER, items: [] };
      groups.set(key, g);
    }
    g.items.push(item);
  }
  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ label, classId, items }) => ({ label, classId, items: [...items].sort((x, y) => compareMembers(memberOf(x), memberOf(y))) }));
}

export type MatrixMeeting = { id: number; title: string; kind: MeetingKind; scheduledAt: string };
export type MatrixRow = { member: MemberLite; cells: (AttendanceStatus | null)[]; summary: AttendanceCounts; rate: number };
export type AttendanceMatrix = {
  meetings: (MatrixMeeting & { date: string; totals: AttendanceCounts })[];
  groups: { label: string; classId: number | null; rows: MatrixRow[] }[];
};

/**
 * The semester grid: one row per member (grouped by pledge class), one column per meeting
 * (ascending by date). A null cell means no record for that member at that meeting.
 */
export function buildAttendanceMatrix(input: {
  members: MemberLite[];
  meetings: MatrixMeeting[];
  rows: { meetingId: number; memberId: number; status: AttendanceStatus }[];
}): AttendanceMatrix {
  const meetings = [...input.meetings].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id - b.id);
  const byKey = new Map<string, AttendanceStatus>();
  for (const r of input.rows) byKey.set(`${r.meetingId}:${r.memberId}`, r.status);

  const rows: MatrixRow[] = input.members.map((member) => {
    const cells = meetings.map((m) => byKey.get(`${m.id}:${member.id}`) ?? null);
    const summary = attendanceSummary(cells.filter((c): c is AttendanceStatus => c !== null).map((status) => ({ status })));
    return { member, cells, summary, rate: attendanceRate(summary) };
  });

  const groups = groupByClass(rows, (r) => r.member).map((g) => ({ label: g.label, classId: g.classId, rows: g.items }));
  const meetingsWithTotals = meetings.map((m, i) => ({
    ...m,
    date: meetingDateOnly(m.scheduledAt),
    totals: attendanceSummary(rows.map((r) => r.cells[i]).filter((c): c is AttendanceStatus => c !== null).map((status) => ({ status }))),
  }));
  return { meetings: meetingsWithTotals, groups };
}

/** Members with the most absences, highest first (ties by name); only members with at least one absence. */
export function mostAbsences(matrix: AttendanceMatrix, limit = 10): MatrixRow[] {
  return matrix.groups
    .flatMap((g) => g.rows)
    .filter((r) => r.summary.absent > 0)
    .sort((a, b) => b.summary.absent - a.summary.absent || a.rate - b.rate || compareMembers(a.member, b.member))
    .slice(0, limit);
}
