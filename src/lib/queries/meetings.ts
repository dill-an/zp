import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  attendance,
  charges,
  excuseRequests,
  meetings,
  members,
  pledgeClasses,
  sanctions,
  type AttendanceRow,
  type AttendanceStatus,
  type ExcuseRequest,
  type Meeting,
  type MeetingKind,
} from "@/db/schema";
import { nowISO } from "@/lib/dates";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import {
  absenteesForFines,
  attendanceRate,
  attendanceSummary,
  buildAttendanceMatrix,
  defaultAttendanceStatus,
  fineDescription,
  groupByClass,
  type AttendanceCounts,
  type AttendanceMatrix,
  type MemberLite,
} from "./meetings-logic";

export type { AttendanceCounts, AttendanceMatrix, MemberLite };

/** Member statuses that appear on an attendance sheet. */
export const ROSTER_STATUSES = ["active", "new_member", "abroad"] as const;

const memberLite = {
  id: members.id,
  firstName: members.firstName,
  lastName: members.lastName,
  preferredName: members.preferredName,
  status: members.status,
};
const classRef = { id: pledgeClasses.id, name: pledgeClasses.name, sortOrder: pledgeClasses.sortOrder };

function toMemberLite(row: { member: Omit<MemberLite, "pledgeClass">; pledgeClass: MemberLite["pledgeClass"] }): MemberLite {
  return { ...row.member, pledgeClass: row.pledgeClass };
}

/** Members who belong on an attendance sheet (active, new member, abroad), with their class. */
export function listRosterMembers(): MemberLite[] {
  return db
    .select({ member: memberLite, pledgeClass: classRef })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .where(inArray(members.status, [...ROSTER_STATUSES]))
    .orderBy(asc(members.lastName), asc(members.firstName))
    .all()
    .map(toMemberLite);
}

function memberLiteById(ids: number[]): Map<number, MemberLite> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ member: memberLite, pledgeClass: classRef })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .where(inArray(members.id, ids))
    .all();
  return new Map(rows.map((r) => [r.member.id, toMemberLite(r)]));
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export type MeetingListItem = Meeting & { counts: AttendanceCounts | null };

function countsByMeeting(meetingIds: number[]): Map<number, AttendanceCounts> {
  if (meetingIds.length === 0) return new Map();
  const rows = db
    .select({ meetingId: attendance.meetingId, status: attendance.status })
    .from(attendance)
    .where(inArray(attendance.meetingId, meetingIds))
    .all();
  const grouped = new Map<number, { status: AttendanceStatus }[]>();
  for (const r of rows) (grouped.get(r.meetingId) ?? grouped.set(r.meetingId, []).get(r.meetingId)!).push({ status: r.status });
  return new Map([...grouped.entries()].map(([id, list]) => [id, attendanceSummary(list)]));
}

/** Upcoming meetings soonest first, or past meetings most recent first. Counts are null until attendance is taken. */
export function listMeetings(opts: { scope: "upcoming" | "past"; kind?: MeetingKind | "all" }): MeetingListItem[] {
  const now = nowISO();
  const kind = opts.kind && opts.kind !== "all" ? opts.kind : undefined;
  const rows = db
    .select()
    .from(meetings)
    .where(and(opts.scope === "upcoming" ? gte(meetings.scheduledAt, now) : lt(meetings.scheduledAt, now), kind ? eq(meetings.kind, kind) : undefined))
    .orderBy(opts.scope === "upcoming" ? asc(meetings.scheduledAt) : desc(meetings.scheduledAt), asc(meetings.id))
    .all();
  const counts = countsByMeeting(rows.filter((m) => m.attendanceTaken).map((m) => m.id));
  return rows.map((m) => ({ ...m, counts: m.attendanceTaken ? (counts.get(m.id) ?? attendanceSummary([])) : null }));
}

export type MeetingDetail = Meeting & {
  counts: AttendanceCounts | null;
  recordedBy: MemberLite | null;
  recordedAt: string | null;
};

export function getMeeting(id: number): MeetingDetail | null {
  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get();
  if (!meeting) return null;
  const rows = db.select().from(attendance).where(eq(attendance.meetingId, id)).orderBy(desc(attendance.recordedAt)).all();
  const latest = rows[0];
  const recordedBy = latest?.recordedById ? (memberLiteById([latest.recordedById]).get(latest.recordedById) ?? null) : null;
  return {
    ...meeting,
    counts: meeting.attendanceTaken ? attendanceSummary(rows) : null,
    recordedBy,
    recordedAt: latest?.recordedAt ?? null,
  };
}

/** The next meeting (any kind) at or after now. */
export function getNextMeeting(kind?: MeetingKind): Meeting | null {
  return (
    db
      .select()
      .from(meetings)
      .where(and(gte(meetings.scheduledAt, nowISO()), kind ? eq(meetings.kind, kind) : undefined))
      .orderBy(asc(meetings.scheduledAt), asc(meetings.id))
      .get() ?? null
  );
}

/** Attendance records of one meeting with the member, grouped by pledge class. */
export type MeetingAttendanceRow = AttendanceRow & { member: MemberLite };
export function getMeetingAttendance(meetingId: number): { label: string; classId: number | null; rows: MeetingAttendanceRow[] }[] {
  const rows = db.select().from(attendance).where(eq(attendance.meetingId, meetingId)).all();
  const people = memberLiteById(rows.map((r) => r.memberId));
  const withMember = rows.flatMap((r) => {
    const member = people.get(r.memberId);
    return member ? [{ ...r, member }] : [];
  });
  return groupByClass(withMember, (r) => r.member).map((g) => ({ label: g.label, classId: g.classId, rows: g.items }));
}

/* ------------------------------------------------------------------ */
/* Per-member attendance                                               */
/* ------------------------------------------------------------------ */

export type MemberAttendanceSummary = AttendanceCounts & { rate: number };

/** Counts over every meeting with attendance taken that has a record for this member. */
export function getAttendanceSummary(memberId: number): MemberAttendanceSummary {
  const rows = db
    .select({ status: attendance.status })
    .from(attendance)
    .innerJoin(meetings, eq(meetings.id, attendance.meetingId))
    .where(and(eq(attendance.memberId, memberId), eq(meetings.attendanceTaken, true)))
    .all();
  const summary = attendanceSummary(rows);
  return { ...summary, rate: attendanceRate(summary) };
}

export type MemberAttendanceEntry = { meeting: Meeting; status: AttendanceStatus; note: string | null; recordedAt: string };

/** This member's attendance records, most recent meeting first. */
export function getMemberAttendance(memberId: number): MemberAttendanceEntry[] {
  return db
    .select({ meeting: meetings, status: attendance.status, note: attendance.note, recordedAt: attendance.recordedAt })
    .from(attendance)
    .innerJoin(meetings, eq(meetings.id, attendance.meetingId))
    .where(and(eq(attendance.memberId, memberId), eq(meetings.attendanceTaken, true)))
    .orderBy(desc(meetings.scheduledAt))
    .all();
}

/* ------------------------------------------------------------------ */
/* The semester grid                                                    */
/* ------------------------------------------------------------------ */

/**
 * Grid of members x meetings with attendance taken. `kind` defaults to house meetings;
 * pass "all" for every kind. Members on the roster plus anyone with a record are included.
 */
export function getAttendanceMatrix(opts: { kind?: MeetingKind | "all"; classId?: number } = {}): AttendanceMatrix {
  const kind = opts.kind ?? "house";
  const meetingRows = db
    .select({ id: meetings.id, title: meetings.title, kind: meetings.kind, scheduledAt: meetings.scheduledAt })
    .from(meetings)
    .where(and(eq(meetings.attendanceTaken, true), kind !== "all" ? eq(meetings.kind, kind) : undefined))
    .orderBy(asc(meetings.scheduledAt))
    .all();
  const meetingIds = meetingRows.map((m) => m.id);
  const rows =
    meetingIds.length === 0
      ? []
      : db
          .select({ meetingId: attendance.meetingId, memberId: attendance.memberId, status: attendance.status })
          .from(attendance)
          .where(inArray(attendance.meetingId, meetingIds))
          .all();

  const roster = listRosterMembers();
  const known = new Set(roster.map((m) => m.id));
  const extraIds = [...new Set(rows.map((r) => r.memberId).filter((id) => !known.has(id)))];
  const all = [...roster, ...memberLiteById(extraIds).values()];
  const filtered = opts.classId != null ? all.filter((m) => m.pledgeClass?.id === opts.classId) : all;
  return buildAttendanceMatrix({ members: filtered, meetings: meetingRows, rows });
}

/* ------------------------------------------------------------------ */
/* Taking attendance                                                    */
/* ------------------------------------------------------------------ */

export type RosterEntry = { member: MemberLite; status: AttendanceStatus; note: string; hasRecord: boolean; excused: boolean };

/** Roster for the attendance sheet with defaults: existing record, else approved excuse, else absent. */
export function getAttendanceRoster(meetingId: number): { label: string; classId: number | null; rows: RosterEntry[] }[] {
  const roster = listRosterMembers();
  const existing = new Map(
    db
      .select()
      .from(attendance)
      .where(eq(attendance.meetingId, meetingId))
      .all()
      .map((r) => [r.memberId, r]),
  );
  const approved = new Set(
    db
      .select({ memberId: excuseRequests.memberId })
      .from(excuseRequests)
      .where(and(eq(excuseRequests.meetingId, meetingId), eq(excuseRequests.status, "approved")))
      .all()
      .map((r) => r.memberId),
  );
  // Members with a record who are no longer on the roster (e.g. went inactive) still show up.
  const known = new Set(roster.map((m) => m.id));
  const extra = [...memberLiteById([...existing.keys()].filter((id) => !known.has(id))).values()];
  const entries: RosterEntry[] = [...roster, ...extra].map((member) => {
    const row = existing.get(member.id);
    return {
      member,
      status: defaultAttendanceStatus(row?.status, approved.has(member.id)),
      note: row?.note ?? "",
      hasRecord: !!row,
      excused: approved.has(member.id),
    };
  });
  return groupByClass(entries, (e) => e.member).map((g) => ({ label: g.label, classId: g.classId, rows: g.items }));
}

/* ------------------------------------------------------------------ */
/* Fines and sanctions for absences                                     */
/* ------------------------------------------------------------------ */

export type FinePreview = { description: string; amountCents: number; members: MemberLite[] };

/** Absent members (not excused) who do not yet have a fine charge for this meeting. */
export function getFinePreview(meeting: Pick<Meeting, "id" | "title" | "scheduledAt">): FinePreview {
  const description = fineDescription(meeting.title, meeting.scheduledAt);
  const rows = db
    .select({ memberId: attendance.memberId, status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.meetingId, meeting.id), eq(attendance.status, "absent")))
    .all();
  const absentIds = rows.map((r) => r.memberId);
  const existing =
    absentIds.length === 0
      ? []
      : db
          .select({ memberId: charges.memberId, description: charges.description })
          .from(charges)
          .where(and(inArray(charges.memberId, absentIds), eq(charges.kind, "fine"), eq(charges.description, description)))
          .all();
  const ids = absenteesForFines(rows, existing, description);
  const people = memberLiteById(ids);
  const amountCents = Number(getSetting(SETTING_KEYS.missedMeetingFineCents)) || 0;
  return { description, amountCents, members: ids.flatMap((id) => people.get(id) ?? []) };
}

export type SanctionPreview = { reason: string; members: MemberLite[] };

/** Absent members who do not yet have a missed_meeting sanction for this meeting. */
export function getSanctionPreview(meeting: Pick<Meeting, "id" | "title" | "scheduledAt">): SanctionPreview {
  const reason = fineDescription(meeting.title, meeting.scheduledAt);
  const rows = db
    .select({ memberId: attendance.memberId, status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.meetingId, meeting.id), eq(attendance.status, "absent")))
    .all();
  const already = new Set(
    db
      .select({ memberId: sanctions.memberId })
      .from(sanctions)
      .where(and(eq(sanctions.source, "missed_meeting"), eq(sanctions.sourceRef, String(meeting.id))))
      .all()
      .map((r) => r.memberId),
  );
  const ids = [...new Set(rows.map((r) => r.memberId))].filter((id) => !already.has(id));
  const people = memberLiteById(ids);
  return { reason, members: ids.flatMap((id) => people.get(id) ?? []) };
}

/* ------------------------------------------------------------------ */
/* Excuse requests                                                      */
/* ------------------------------------------------------------------ */

export type ExcuseWithMeeting = ExcuseRequest & { meeting: Meeting };
export type ExcuseForReview = ExcuseWithMeeting & { member: MemberLite; reviewedBy: MemberLite | null };

/** This member's meeting excuse requests (newest first), optionally only for some meetings. */
export function getExcuseRequestsForMember(memberId: number, meetingIds?: number[]): ExcuseWithMeeting[] {
  if (meetingIds && meetingIds.length === 0) return [];
  return db
    .select({ request: excuseRequests, meeting: meetings })
    .from(excuseRequests)
    .innerJoin(meetings, eq(meetings.id, excuseRequests.meetingId))
    .where(and(eq(excuseRequests.memberId, memberId), isNotNull(excuseRequests.meetingId), meetingIds ? inArray(excuseRequests.meetingId, meetingIds) : undefined))
    .orderBy(desc(excuseRequests.createdAt), desc(excuseRequests.id))
    .all()
    .map((r) => ({ ...r.request, meeting: r.meeting }));
}

/** The most relevant request of a member for one meeting: pending first, then the latest decision. */
export function getMyExcuseForMeeting(memberId: number, meetingId: number): ExcuseRequest | null {
  const rows = db
    .select()
    .from(excuseRequests)
    .where(and(eq(excuseRequests.memberId, memberId), eq(excuseRequests.meetingId, meetingId)))
    .orderBy(desc(excuseRequests.createdAt), desc(excuseRequests.id))
    .all();
  return rows.find((r) => r.status === "pending") ?? rows.find((r) => r.status === "approved") ?? rows[0] ?? null;
}

/** Map meetingId -> the member's most relevant request, for list pages. */
export function getMyExcusesByMeeting(memberId: number, meetingIds: number[]): Map<number, ExcuseRequest> {
  const rows = getExcuseRequestsForMember(memberId, meetingIds);
  const out = new Map<number, ExcuseRequest>();
  const rank = (s: ExcuseRequest["status"]) => (s === "pending" ? 0 : s === "approved" ? 1 : 2);
  for (const r of rows) {
    const prev = out.get(r.meetingId!);
    if (!prev || rank(r.status) < rank(prev.status)) out.set(r.meetingId!, r);
  }
  return out;
}

function withPeople(rows: { request: ExcuseRequest; meeting: Meeting }[]): ExcuseForReview[] {
  const ids = [...new Set(rows.flatMap((r) => [r.request.memberId, ...(r.request.reviewedById ? [r.request.reviewedById] : [])]))];
  const people = memberLiteById(ids);
  return rows.flatMap((r) => {
    const member = people.get(r.request.memberId);
    if (!member) return [];
    return [{ ...r.request, meeting: r.meeting, member, reviewedBy: r.request.reviewedById ? (people.get(r.request.reviewedById) ?? null) : null }];
  });
}

/** Pending meeting excuse requests, soonest meeting first. */
export function listPendingExcuses(): ExcuseForReview[] {
  const rows = db
    .select({ request: excuseRequests, meeting: meetings })
    .from(excuseRequests)
    .innerJoin(meetings, eq(meetings.id, excuseRequests.meetingId))
    .where(eq(excuseRequests.status, "pending"))
    .orderBy(asc(meetings.scheduledAt), asc(excuseRequests.createdAt))
    .all();
  return withPeople(rows);
}

/** Recently decided meeting excuse requests. */
export function listRecentExcuseDecisions(limit = 25): ExcuseForReview[] {
  const rows = db
    .select({ request: excuseRequests, meeting: meetings })
    .from(excuseRequests)
    .innerJoin(meetings, eq(meetings.id, excuseRequests.meetingId))
    .where(inArray(excuseRequests.status, ["approved", "denied"]))
    .orderBy(desc(excuseRequests.reviewedAt), desc(excuseRequests.id))
    .limit(limit)
    .all();
  return withPeople(rows);
}

export function countPendingExcuses(): number {
  return db.select({ id: excuseRequests.id }).from(excuseRequests).where(and(eq(excuseRequests.status, "pending"), isNotNull(excuseRequests.meetingId))).all().length;
}
