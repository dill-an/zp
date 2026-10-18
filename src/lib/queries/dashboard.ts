import "server-only";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, members, type AttendanceStatus, type AuditEntry, type ExcuseRequest, type Meeting } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { can, type CurrentUser } from "@/lib/permissions";
import { listChairs } from "@/lib/queries/common";
import { countOpenMaintenance, getActiveAnnouncements, getMyDuties, getUpcomingEvents, type AnnouncementRow, type EventListItem, type MyDuty } from "@/lib/queries/community";
import { getActivePeriod, getMemberBalance, getPeriodStats, type MemberBalance, type PeriodStats } from "@/lib/queries/dues";
import { getLaborContext, getLaborStats, getMemberWeekJobs, getPendingLaborCounts, getWeekGrid, type AssignmentDetail } from "@/lib/queries/labor";
import { nextWeekStart } from "@/lib/queries/labor-logic";
import {
  countPendingExcuses,
  getAttendanceSummary,
  getMemberAttendance,
  getMyExcuseForMeeting,
  getMyExcusesByMeeting,
  getNextMeeting,
  listMeetings,
  type MeetingListItem,
  type MemberAttendanceSummary,
} from "@/lib/queries/meetings";
import { attendanceRate } from "@/lib/queries/meetings-logic";
import { getOpenSanctionsForMember, getSanctionStats, type SanctionRow } from "@/lib/queries/sanctions";
import type { SanctionStats } from "@/lib/queries/sanctions-logic";
import { getTaskCountsByChair, getTasksForMember, type TaskListItem } from "@/lib/queries/tasks";
import { AUDIT_PAGE_SIZE, completionPercent, dueBucket, inWeek, pageCount, weekSummary, type AuditParams, type DueBucket, type WeekSummary } from "./dashboard-logic";

/*
 * Everything here combines the other modules' query exports; the only table read directly is
 * audit_log, which no module lists.
 */

/* ------------------------------------------------------------------ */
/* My week                                                             */
/* ------------------------------------------------------------------ */

export type TaskWithBucket = TaskListItem & { bucket: DueBucket };

export type MeetingThisWeek = {
  meeting: MeetingListItem;
  /** My most relevant excuse request for the meeting. */
  excuse: ExcuseRequest | null;
  /** My recorded attendance once it was taken. */
  attendance: AttendanceStatus | null;
  isPast: boolean;
};

export type MyWeek = {
  today: string;
  weekStart: string;
  nextWeekStart: string;
  jobs: AssignmentDetail[];
  nextJobs: AssignmentDetail[];
  /** Open tasks assigned to me, overdue first. */
  tasks: TaskWithBucket[];
  /** Unfinished duties at events that have not ended, soonest first. */
  duties: MyDuty[];
  dutiesThisWeek: MyDuty[];
  sanctions: SanctionRow[];
  meetings: MeetingThisWeek[];
  summary: WeekSummary;
};

/** What is on a brother's plate this week, pulled from every module. */
export function getMyWeek(user: CurrentUser, now: Date = new Date()): MyWeek {
  const ctx = getLaborContext();
  const weekStart = ctx.currentWeekStart;
  const next = nextWeekStart(weekStart);
  const jobs = getMemberWeekJobs(user.id, weekStart);
  const nextJobs = getMemberWeekJobs(user.id, next);
  const tasks = getTasksForMember(user.id, { openOnly: true }).map((t) => ({ ...t, bucket: dueBucket(t.dueAt, weekStart, now) }));
  const duties = getMyDuties(user.id);
  const dutiesThisWeek = duties.filter((d) => inWeek(d.startsAt ?? d.event.startsAt, weekStart));
  const sanctions = getOpenSanctionsForMember(user.id, now);

  const past = listMeetings({ scope: "past" }).filter((m) => inWeek(m.scheduledAt, weekStart));
  const upcoming = listMeetings({ scope: "upcoming" }).filter((m) => inWeek(m.scheduledAt, weekStart));
  const thisWeek = [...past, ...upcoming].sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : a.id - b.id));
  const ids = thisWeek.map((m) => m.id);
  const excuses = getMyExcusesByMeeting(user.id, ids);
  const attendance = new Map(getMemberAttendance(user.id).map((a) => [a.meeting.id, a.status]));
  const nowIso = now.toISOString();
  const meetings: MeetingThisWeek[] = thisWeek.map((meeting) => ({
    meeting,
    excuse: excuses.get(meeting.id) ?? null,
    attendance: attendance.get(meeting.id) ?? null,
    isPast: meeting.scheduledAt < nowIso,
  }));

  const summary = weekSummary({
    jobs: jobs.map((j) => ({ state: j.state })),
    tasks: tasks.map((t) => ({ bucket: t.bucket })),
    duties: dutiesThisWeek.map((d) => ({ done: d.status === "done" })),
    meetings: meetings.map((m) => ({ attended: m.attendance === "present" || m.attendance === "late" })),
  });

  return { today: ctx.today, weekStart, nextWeekStart: next, jobs, nextJobs, tasks, duties, dutiesThisWeek, sanctions, meetings, summary };
}

/* ------------------------------------------------------------------ */
/* Dashboard (personal cards)                                          */
/* ------------------------------------------------------------------ */

export type DashboardData = MyWeek & {
  balance: MemberBalance;
  nextMeeting: { meeting: Meeting; excuse: ExcuseRequest | null } | null;
  attendance: MemberAttendanceSummary;
  events: EventListItem[];
  announcements: AnnouncementRow[];
};

export function getDashboardData(user: CurrentUser, now: Date = new Date()): DashboardData {
  const week = getMyWeek(user, now);
  const nextMeeting = getNextMeeting();
  return {
    ...week,
    balance: getMemberBalance(user.id),
    nextMeeting: nextMeeting ? { meeting: nextMeeting, excuse: getMyExcuseForMeeting(user.id, nextMeeting.id) } : null,
    attendance: getAttendanceSummary(user.id),
    events: getUpcomingEvents(5, user.id),
    announcements: getActiveAnnouncements(user, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Officer panel                                                       */
/* ------------------------------------------------------------------ */

export type OfficerChairCard = { id: number; slug: string; name: string; open: number; overdue: number };

export type OfficerPanel = {
  chairs: OfficerChairCard[];
  labor: { weekStart: string; hasWeek: boolean; unfilled: number; unverified: number; swaps: number; excuses: number } | null;
  dues: { periodName: string | null; stats: PeriodStats } | null;
  meetings: { needsAttendance: MeetingListItem[]; next: Meeting | null; pendingExcuses: number } | null;
  maintenance: { open: number } | null;
  sanctions: SanctionStats | null;
  isEmpty: boolean;
};

/** Counts for every chair the user holds and every module permission they have. */
export function getOfficerPanel(user: CurrentUser, now: Date = new Date()): OfficerPanel {
  const taskCounts = user.chairIds.length ? getTaskCountsByChair(now) : new Map();
  const chairs: OfficerChairCard[] = listChairs()
    .filter((c) => user.chairIds.includes(c.id))
    .map((c) => {
      const counts = taskCounts.get(c.id) ?? { open: 0, overdue: 0 };
      return { id: c.id, slug: c.slug, name: c.name, open: counts.open, overdue: counts.overdue };
    });

  let labor: OfficerPanel["labor"] = null;
  if (can(user, "labor.manage")) {
    const ctx = getLaborContext();
    const grid = getWeekGrid(ctx.currentWeekStart);
    const pending = getPendingLaborCounts();
    labor = {
      weekStart: ctx.currentWeekStart,
      hasWeek: !!grid,
      unfilled: grid ? Math.max(0, grid.counts.slots - grid.counts.filled) : 0,
      unverified: grid ? grid.assignments.filter((a) => a.status === "done" && !a.verifiedAt).length : 0,
      swaps: pending.swaps,
      excuses: pending.excuses,
    };
  }

  let dues: OfficerPanel["dues"] = null;
  if (can(user, "dues.manage")) {
    const period = getActivePeriod();
    dues = { periodName: period?.name ?? null, stats: getPeriodStats(period?.id) };
  }

  let meetings: OfficerPanel["meetings"] = null;
  if (can(user, "meetings.manage")) {
    meetings = {
      needsAttendance: listMeetings({ scope: "past" })
        .filter((m) => !m.attendanceTaken)
        .slice(0, 3),
      next: getNextMeeting(),
      pendingExcuses: countPendingExcuses(),
    };
  }

  const maintenance = can(user, "maintenance.manage") ? { open: countOpenMaintenance() } : null;
  const sanctions = can(user, "sanctions.manage") ? getSanctionStats(now) : null;

  return { chairs, labor, dues, meetings, maintenance, sanctions, isEmpty: chairs.length === 0 && !labor && !dues && !meetings && !maintenance && !sanctions };
}

/* ------------------------------------------------------------------ */
/* House pulse                                                         */
/* ------------------------------------------------------------------ */

export type HousePulse = {
  labor: { weekStart: string; done: number; assigned: number; percent: number } | null;
  lastMeeting: { meeting: MeetingListItem; rate: number } | null;
  openMaintenance: number;
  zeroCleans: number;
  poolSize: number;
};

export function getHousePulse(): HousePulse {
  const ctx = getLaborContext();
  const grid = getWeekGrid(ctx.currentWeekStart);
  const labor = grid && grid.week.isPublished ? { weekStart: ctx.currentWeekStart, done: grid.counts.done, assigned: grid.counts.filled, percent: completionPercent(grid.counts.done, grid.counts.filled) } : null;
  const last = listMeetings({ scope: "past" }).find((m) => m.attendanceTaken && m.counts);
  const lastMeeting = last && last.counts ? { meeting: last, rate: attendanceRate(last.counts) } : null;
  const stats = getLaborStats();
  const poolIds = new Set(stats.pool.map((m) => m.id));
  const zeroCleans = stats.belowThreshold(1).filter((s) => poolIds.has(s.memberId)).length;
  return { labor, lastMeeting, openMaintenance: countOpenMaintenance(), zeroCleans, poolSize: stats.pool.length };
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export type AuditActor = { id: number; firstName: string; lastName: string; preferredName: string; username: string };
export type AuditRow = AuditEntry & { actor: AuditActor | null };
export type AuditPage = { rows: AuditRow[]; total: number; page: number; pageCount: number; perPage: number };

function auditWhere(params: AuditParams): SQL | undefined {
  const conds: SQL[] = [];
  if (params.actorId != null) conds.push(eq(auditLog.actorId, params.actorId));
  if (params.entity) conds.push(eq(auditLog.entityType, params.entity));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const match = or(sql`${auditLog.summary} like ${needle} escape '\\'`, sql`${auditLog.action} like ${needle} escape '\\'`, sql`${auditLog.entityId} like ${needle} escape '\\'`);
    if (match) conds.push(match);
  }
  return conds.length ? and(...conds) : undefined;
}

/** Newest first, `perPage` per page; pages past the end come back empty. */
export function listAuditEntries(params: AuditParams, perPage = AUDIT_PAGE_SIZE): AuditPage {
  const where = auditWhere(params);
  const total = Number(db.select({ n: sql<number>`count(*)` }).from(auditLog).where(where).get()?.n ?? 0);
  const pages = pageCount(total, perPage);
  const page = Math.min(Math.max(1, params.page), pages);
  const rows = db
    .select({
      entry: auditLog,
      actor: { id: members.id, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName, username: members.username },
    })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(perPage)
    .offset((page - 1) * perPage)
    .all()
    .map((r) => ({ ...r.entry, actor: r.actor && r.actor.id != null ? r.actor : null }));
  return { rows, total, page, pageCount: pages, perPage };
}

/** Distinct entity types that appear in the log, for the filter select. */
export function listAuditEntityTypes(): string[] {
  return db
    .selectDistinct({ entityType: auditLog.entityType })
    .from(auditLog)
    .orderBy(auditLog.entityType)
    .all()
    .map((r) => r.entityType);
}

/** Members who have acted at least once, by last name (for the actor filter). */
export function listAuditActors(): AuditActor[] {
  return db
    .selectDistinct({ id: members.id, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName, username: members.username })
    .from(auditLog)
    .innerJoin(members, eq(members.id, auditLog.actorId))
    .orderBy(members.lastName, members.firstName)
    .all();
}

/** Today in the house timezone, re-exported so pages do not need two imports. */
export function dashboardToday(): string {
  return todayISO();
}
