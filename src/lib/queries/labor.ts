import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  excuseRequests,
  jobAssignments,
  jobSwapRequests,
  jobTypes,
  laborWeeks,
  members,
  sanctions,
  type AssignmentStatus,
  type ExcuseRequest,
  type JobSwapRequest,
  type JobType,
  type LaborWeek,
} from "@/db/schema";
import { currentWeekStart, todayISO } from "@/lib/dates";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { listMembers, type MemberWithClass } from "@/lib/queries/common";
import {
  assignmentState,
  belowThreshold,
  dueDateFor,
  groupJobTypesByCategory,
  laborStats,
  sortJobTypes,
  startDateFor,
  type AssignmentState,
  type LaborStats,
  type MemberStat,
  type StatsScope,
} from "@/lib/queries/labor-logic";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type MemberLite = {
  id: number;
  firstName: string;
  lastName: string;
  preferredName: string;
  username: string;
  laborGroup: MemberWithClass["laborGroup"];
  status: MemberWithClass["status"];
};

/** One assignment with everything a page needs to render it. */
export type AssignmentDetail = {
  id: number;
  weekId: number;
  weekStart: string;
  weekPublished: boolean;
  jobTypeId: number;
  jobType: JobType;
  memberId: number;
  member: MemberLite;
  slot: number;
  status: AssignmentStatus;
  completedAt: string | null;
  verifiedById: number | null;
  verifiedAt: string | null;
  verifiedBy: MemberLite | null;
  notes: string | null;
  startDate: string;
  dueDate: string;
  state: AssignmentState;
};

export type GridSlot = { slot: number; assignment: AssignmentDetail | null };
export type GridRow = { jobType: JobType; startDate: string; dueDate: string; slots: GridSlot[] };
export type GridGroup = { category: string; label: string; rows: GridRow[] };

export type WeekGrid = {
  week: LaborWeek;
  groups: GridGroup[];
  assignments: AssignmentDetail[];
  today: string;
  trackingStart: string;
  /** True when every assignment is still plain "assigned" (the week may be deleted). */
  untouched: boolean;
  counts: { filled: number; slots: number; done: number; missed: number; excused: number };
};

export type SwapRequestDetail = JobSwapRequest & {
  assignment: AssignmentDetail;
  requestedBy: MemberLite;
  targetMember: MemberLite | null;
  resolvedBy: MemberLite | null;
};

export type ExcuseRequestDetail = ExcuseRequest & {
  assignment: AssignmentDetail;
  member: MemberLite;
  reviewedBy: MemberLite | null;
};

export type BrotherMatrixRow = {
  member: MemberWithClass;
  byWeek: Record<string, AssignmentDetail[]>;
  totals: { jobs: number; points: number; done: number; missed: number };
};

export type BrothersMatrix = {
  weeks: LaborWeek[];
  currentWeekStart: string;
  rows: BrotherMatrixRow[];
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export function getLaborContext(): { today: string; trackingStart: string; currentWeekStart: string } {
  return { today: todayISO(), trackingStart: getSetting(SETTING_KEYS.laborTrackingStart) || "2026-10-18", currentWeekStart: currentWeekStart() };
}

const memberLite = {
  id: members.id,
  firstName: members.firstName,
  lastName: members.lastName,
  preferredName: members.preferredName,
  username: members.username,
  laborGroup: members.laborGroup,
  status: members.status,
};

function memberLiteById(ids: number[]): Map<number, MemberLite> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = db.select(memberLite).from(members).where(inArray(members.id, unique)).all();
  return new Map(rows.map((m) => [m.id, m]));
}

/* ------------------------------------------------------------------ */
/* Job types                                                           */
/* ------------------------------------------------------------------ */

export function listJobTypes(opts: { includeInactive?: boolean } = {}): JobType[] {
  const rows = db
    .select()
    .from(jobTypes)
    .where(opts.includeInactive ? undefined : eq(jobTypes.isActive, true))
    .orderBy(asc(jobTypes.sortOrder), asc(jobTypes.id))
    .all();
  return sortJobTypes(rows);
}

export function getJobType(id: number): JobType | null {
  return db.select().from(jobTypes).where(eq(jobTypes.id, id)).get() ?? null;
}

/** Number of assignments that reference a job type (decides archive vs delete). */
export function countJobTypeAssignments(jobTypeId: number): number {
  return db.select({ id: jobAssignments.id }).from(jobAssignments).where(eq(jobAssignments.jobTypeId, jobTypeId)).all().length;
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

/** Every labor week, oldest first. */
export function listWeeks(opts: { includeUnpublished?: boolean } = {}): LaborWeek[] {
  return db
    .select()
    .from(laborWeeks)
    .where(opts.includeUnpublished === false ? eq(laborWeeks.isPublished, true) : undefined)
    .orderBy(asc(laborWeeks.weekStart))
    .all();
}

export function getWeek(weekStart: string): LaborWeek | null {
  return db.select().from(laborWeeks).where(eq(laborWeeks.weekStart, weekStart)).get() ?? null;
}

export function getWeekById(id: number): LaborWeek | null {
  return db.select().from(laborWeeks).where(eq(laborWeeks.id, id)).get() ?? null;
}

/** Whether a week exists and is posted (for "this week is still a draft" notices elsewhere in the app). */
export function getWeekStatus(weekStart: string): { exists: boolean; isPublished: boolean } {
  const week = getWeek(weekStart);
  return { exists: !!week, isPublished: !!week?.isPublished };
}

/** The most recent week that starts before `weekStart` (source for "Copy last week"). */
export function getPreviousWeek(weekStart: string): LaborWeek | null {
  const all = listWeeks();
  let best: LaborWeek | null = null;
  for (const w of all) if (w.weekStart < weekStart) best = w;
  return best;
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

type RawRow = { a: typeof jobAssignments.$inferSelect; jt: JobType; w: LaborWeek; m: MemberLite };

function selectAssignments() {
  return db
    .select({ a: jobAssignments, jt: jobTypes, w: laborWeeks, m: memberLite })
    .from(jobAssignments)
    .innerJoin(jobTypes, eq(jobTypes.id, jobAssignments.jobTypeId))
    .innerJoin(laborWeeks, eq(laborWeeks.id, jobAssignments.weekId))
    .innerJoin(members, eq(members.id, jobAssignments.memberId));
}

function toDetails(rows: RawRow[], ctx = getLaborContext()): AssignmentDetail[] {
  const verifiers = memberLiteById(rows.map((r) => r.a.verifiedById).filter((id): id is number => id != null));
  return rows.map((r) => ({
    id: r.a.id,
    weekId: r.a.weekId,
    weekStart: r.w.weekStart,
    weekPublished: r.w.isPublished,
    jobTypeId: r.a.jobTypeId,
    jobType: r.jt,
    memberId: r.a.memberId,
    member: r.m,
    slot: r.a.slot,
    status: r.a.status,
    completedAt: r.a.completedAt,
    verifiedById: r.a.verifiedById,
    verifiedAt: r.a.verifiedAt,
    verifiedBy: r.a.verifiedById != null ? (verifiers.get(r.a.verifiedById) ?? null) : null,
    notes: r.a.notes,
    startDate: startDateFor(r.w.weekStart, r.jt),
    dueDate: dueDateFor(r.w.weekStart, r.jt),
    state: assignmentState(r.a, r.jt, r.w.weekStart, ctx.today, ctx.trackingStart),
  }));
}

/** Sort: week ascending, then category order, then slot. */
function sortDetails(list: AssignmentDetail[], weekOrder: "asc" | "desc" = "asc"): AssignmentDetail[] {
  const order = new Map(sortJobTypes(list.map((d) => d.jobType)).map((jt, i) => [jt.id, i]));
  return [...list].sort((x, y) => {
    const w = x.weekStart < y.weekStart ? -1 : x.weekStart > y.weekStart ? 1 : 0;
    if (w !== 0) return weekOrder === "asc" ? w : -w;
    return (order.get(x.jobTypeId) ?? 0) - (order.get(y.jobTypeId) ?? 0) || x.slot - y.slot;
  });
}

export function getAssignment(id: number): AssignmentDetail | null {
  const row = selectAssignments().where(eq(jobAssignments.id, id)).get();
  return row ? toDetails([row])[0] : null;
}

export function getWeekAssignments(weekId: number): AssignmentDetail[] {
  return sortDetails(toDetails(selectAssignments().where(eq(jobAssignments.weekId, weekId)).all()));
}

/** Every assignment in the database as details (used by stats and the matrix). */
function allAssignments(opts: { includeUnpublished?: boolean } = {}): AssignmentDetail[] {
  const rows = selectAssignments()
    .where(opts.includeUnpublished ? undefined : eq(laborWeeks.isPublished, true))
    .all();
  return toDetails(rows);
}

/**
 * The weekly grid: one row per active job type (plus inactive ones that still have assignments
 * that week), one cell per slot. Null when no `labor_weeks` row exists for that Sunday.
 */
export function getWeekGrid(weekStart: string): WeekGrid | null {
  const week = getWeek(weekStart);
  if (!week) return null;
  const ctx = getLaborContext();
  const assignments = getWeekAssignments(week.id);
  const active = listJobTypes();
  const extraIds = new Set(assignments.map((a) => a.jobTypeId).filter((id) => !active.some((jt) => jt.id === id)));
  const extra = extraIds.size ? listJobTypes({ includeInactive: true }).filter((jt) => extraIds.has(jt.id)) : [];
  const types = sortJobTypes([...active, ...extra]);
  const groups: GridGroup[] = groupJobTypesByCategory(types).map((g) => ({
    category: g.category,
    label: g.label,
    rows: g.jobTypes.map((jt) => {
      const mine = assignments.filter((a) => a.jobTypeId === jt.id);
      const slotCount = Math.max(jt.slots, ...mine.map((a) => a.slot), 1);
      const slots: GridSlot[] = [];
      for (let s = 1; s <= slotCount; s++) slots.push({ slot: s, assignment: mine.find((a) => a.slot === s) ?? null });
      return { jobType: jt, startDate: startDateFor(weekStart, jt), dueDate: dueDateFor(weekStart, jt), slots };
    }),
  }));
  const slots = groups.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.slots.length, 0), 0);
  return {
    week,
    groups,
    assignments,
    today: ctx.today,
    trackingStart: ctx.trackingStart,
    untouched: assignments.every((a) => a.status === "assigned" && !a.completedAt && !a.verifiedAt),
    counts: {
      filled: assignments.length,
      slots,
      done: assignments.filter((a) => a.status === "done").length,
      missed: assignments.filter((a) => a.status === "missed").length,
      excused: assignments.filter((a) => a.status === "excused").length,
    },
  };
}

/** A brother's jobs in one week (published weeks only unless asked). */
export function getMemberWeekJobs(memberId: number, weekStart: string, opts: { includeUnpublished?: boolean } = {}): AssignmentDetail[] {
  const week = getWeek(weekStart);
  if (!week) return [];
  if (!week.isPublished && !opts.includeUnpublished) return [];
  const rows = selectAssignments().where(and(eq(jobAssignments.memberId, memberId), eq(jobAssignments.weekId, week.id))).all();
  return sortDetails(toDetails(rows));
}

/** A brother's open jobs that are not yet past due, soonest first. */
export function getMemberUpcomingJobs(memberId: number, limit = 5): AssignmentDetail[] {
  const ctx = getLaborContext();
  const rows = selectAssignments().where(and(eq(jobAssignments.memberId, memberId), eq(jobAssignments.status, "assigned"), eq(laborWeeks.isPublished, true))).all();
  return toDetails(rows, ctx)
    .filter((a) => a.dueDate >= ctx.today)
    .sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.slot - y.slot))
    .slice(0, limit);
}

/** Every assignment a brother has had, most recent week first. */
export function getMemberAssignments(memberId: number, opts: { includeUnpublished?: boolean } = {}): AssignmentDetail[] {
  const rows = selectAssignments()
    .where(and(eq(jobAssignments.memberId, memberId), opts.includeUnpublished ? undefined : eq(laborWeeks.isPublished, true)))
    .all();
  return sortDetails(toDetails(rows), "desc");
}

/* ------------------------------------------------------------------ */
/* Pool and stats                                                      */
/* ------------------------------------------------------------------ */

/** Brothers eligible for labor: active and in the cooks or cleans group. */
export function getLaborPool(): MemberWithClass[] {
  return listMembers({ activeOnly: true, laborPoolOnly: true });
}

export type LaborStatsReport = LaborStats & {
  members: Map<number, MemberLite>;
  jobTypes: JobType[];
  pool: MemberWithClass[];
  belowThreshold: (min: number) => MemberStat[];
};

/**
 * Semester fairness stats over published weeks (all weeks when `includeUnpublished`). Open jobs from
 * weeks before `labor_tracking_start` are reported as "not tracked" rather than pending; `scope` limits
 * the median, the below-median flag and the threshold list to one labor group (default: the whole pool).
 */
export function getLaborStats(opts: { includeUnpublished?: boolean; scope?: StatsScope } = {}): LaborStatsReport {
  const ctx = getLaborContext();
  const pool = getLaborPool();
  const types = listJobTypes({ includeInactive: true });
  const assignments = allAssignments(opts);
  const stats = laborStats(
    assignments.map((a) => ({ jobTypeId: a.jobTypeId, memberId: a.memberId, status: a.status, verifiedAt: a.verifiedAt, weekStart: a.weekStart })),
    types,
    pool.map((m) => ({ id: m.id, laborGroup: m.laborGroup, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName })),
    { scope: opts.scope ?? "all", trackingStart: ctx.trackingStart },
  );
  const memberMap = new Map<number, MemberLite>();
  for (const m of pool) memberMap.set(m.id, { id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName, username: m.username, laborGroup: m.laborGroup, status: m.status });
  for (const a of assignments) if (!memberMap.has(a.memberId)) memberMap.set(a.memberId, a.member);
  return { ...stats, members: memberMap, jobTypes: types, pool, belowThreshold: (min) => belowThreshold(stats, min) };
}

export type MemberLaborStats = MemberStat & {
  /** The group the median, rank and pool size are measured within: the brother's own labor group, or the whole pool. */
  scope: StatsScope;
  medianPoints: number;
  medianJobs: number;
  poolSize: number;
  rank: number;
};

/**
 * One brother's totals plus where they sit against the median of their own labor group (cooks are
 * measured against cooks, cleans against cleans; a brother outside the pool against everyone).
 * Open jobs from before tracking started are counted as `notTracked`, not pending.
 */
export function getMemberLaborStats(memberId: number): MemberLaborStats {
  const me = db.select({ laborGroup: members.laborGroup }).from(members).where(eq(members.id, memberId)).get();
  const scope: StatsScope = me?.laborGroup === "cooks" || me?.laborGroup === "cleans" ? me.laborGroup : "all";
  const stats = getLaborStats({ scope });
  const mine = stats.perMember.find((s) => s.memberId === memberId) ?? {
    memberId,
    laborGroup: "none" as const,
    assigned: 0,
    pending: 0,
    notTracked: 0,
    done: 0,
    verified: 0,
    missed: 0,
    excused: 0,
    jobs: 0,
    points: 0,
    donePct: null,
    belowMedian: false,
  };
  const inScope = new Set(stats.pool.filter((m) => scope === "all" || m.laborGroup === scope).map((m) => m.id));
  const ranked = stats.perMember.filter((s) => inScope.has(s.memberId)).sort((a, b) => b.points - a.points || b.jobs - a.jobs || a.memberId - b.memberId);
  const rank = ranked.findIndex((s) => s.memberId === memberId) + 1;
  return { ...mine, scope, medianPoints: stats.medianPoints, medianJobs: stats.medianJobs, poolSize: ranked.length, rank };
}

/* ------------------------------------------------------------------ */
/* Brothers matrix                                                     */
/* ------------------------------------------------------------------ */

/** Rows = labor pool brothers, columns = every labor week; cells = that brother's jobs. */
export function getBrothersWeeklyMatrix(opts: { includeUnpublished?: boolean; group?: "cooks" | "cleans"; q?: string } = {}): BrothersMatrix {
  const ctx = getLaborContext();
  const weeks = listWeeks({ includeUnpublished: !!opts.includeUnpublished });
  const assignments = allAssignments(opts);
  let pool = getLaborPool();
  if (opts.group) pool = pool.filter((m) => m.laborGroup === opts.group);
  const q = opts.q?.trim().toLowerCase();
  if (q) pool = pool.filter((m) => `${m.firstName} ${m.lastName} ${m.preferredName} ${m.username}`.toLowerCase().includes(q));
  const byMember = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) (byMember.get(a.memberId) ?? byMember.set(a.memberId, []).get(a.memberId)!).push(a);
  const rows: BrotherMatrixRow[] = pool.map((member) => {
    const mine = sortDetails(byMember.get(member.id) ?? []);
    const byWeek: Record<string, AssignmentDetail[]> = {};
    const totals = { jobs: 0, points: 0, done: 0, missed: 0 };
    for (const a of mine) {
      (byWeek[a.weekStart] ??= []).push(a);
      if (a.status === "assigned" || a.status === "done" || a.status === "swapped") {
        totals.jobs += 1;
        totals.points += a.jobType.points;
      }
      if (a.status === "done") totals.done += 1;
      if (a.status === "missed") totals.missed += 1;
    }
    return { member, byWeek, totals };
  });
  return { weeks, currentWeekStart: ctx.currentWeekStart, rows };
}

/* ------------------------------------------------------------------ */
/* Swap and excuse requests                                            */
/* ------------------------------------------------------------------ */

function withAssignments<T extends { assignmentId: number }>(rows: T[]): Map<number, AssignmentDetail> {
  const ids = [...new Set(rows.map((r) => r.assignmentId))];
  if (!ids.length) return new Map();
  const details = toDetails(selectAssignments().where(inArray(jobAssignments.id, ids)).all());
  return new Map(details.map((d) => [d.id, d]));
}

export function listSwapRequests(opts: { status?: JobSwapRequest["status"][]; memberId?: number } = {}): SwapRequestDetail[] {
  const rows = db
    .select()
    .from(jobSwapRequests)
    .where(opts.status?.length ? inArray(jobSwapRequests.status, opts.status) : undefined)
    .orderBy(desc(jobSwapRequests.createdAt), desc(jobSwapRequests.id))
    .all();
  const assignments = withAssignments(rows);
  const people = memberLiteById(rows.flatMap((r) => [r.requestedById, r.targetMemberId, r.resolvedById].filter((id): id is number => id != null)));
  const out: SwapRequestDetail[] = [];
  for (const r of rows) {
    const assignment = assignments.get(r.assignmentId);
    const requestedBy = people.get(r.requestedById);
    if (!assignment || !requestedBy) continue;
    if (opts.memberId != null && r.requestedById !== opts.memberId && r.targetMemberId !== opts.memberId) continue;
    out.push({
      ...r,
      assignment,
      requestedBy,
      targetMember: r.targetMemberId != null ? (people.get(r.targetMemberId) ?? null) : null,
      resolvedBy: r.resolvedById != null ? (people.get(r.resolvedById) ?? null) : null,
    });
  }
  return out;
}

export function getSwapRequest(id: number): SwapRequestDetail | null {
  const row = db.select().from(jobSwapRequests).where(eq(jobSwapRequests.id, id)).get();
  if (!row) return null;
  return listSwapRequests().find((r) => r.id === id) ?? null;
}

/** Excuse requests that point at a job assignment (meeting excuses belong to the meetings module). */
export function listExcuseRequests(opts: { status?: ExcuseRequest["status"][]; memberId?: number } = {}): ExcuseRequestDetail[] {
  const rows = db
    .select()
    .from(excuseRequests)
    .where(and(opts.status?.length ? inArray(excuseRequests.status, opts.status) : undefined, opts.memberId != null ? eq(excuseRequests.memberId, opts.memberId) : undefined))
    .orderBy(desc(excuseRequests.createdAt), desc(excuseRequests.id))
    .all()
    .filter((r): r is ExcuseRequest & { assignmentId: number } => r.assignmentId != null);
  const assignments = withAssignments(rows);
  const people = memberLiteById(rows.flatMap((r) => [r.memberId, r.reviewedById].filter((id): id is number => id != null)));
  const out: ExcuseRequestDetail[] = [];
  for (const r of rows) {
    const assignment = assignments.get(r.assignmentId);
    const member = people.get(r.memberId);
    if (!assignment || !member) continue;
    out.push({ ...r, assignment, member, reviewedBy: r.reviewedById != null ? (people.get(r.reviewedById) ?? null) : null });
  }
  return out;
}

/** Make-up sanctions issued for missed assignments, keyed by assignment id. */
export function getSanctionsForAssignments(assignmentIds: number[]): Map<number, { id: number; status: string }> {
  if (!assignmentIds.length) return new Map();
  const rows = db
    .select({ id: sanctions.id, status: sanctions.status, sourceRef: sanctions.sourceRef })
    .from(sanctions)
    .where(and(eq(sanctions.source, "missed_clean"), inArray(sanctions.sourceRef, assignmentIds.map(String))))
    .orderBy(desc(sanctions.id))
    .all();
  const out = new Map<number, { id: number; status: string }>();
  for (const r of rows) {
    const key = Number(r.sourceRef);
    if (!out.has(key)) out.set(key, { id: r.id, status: r.status });
  }
  return out;
}

/** Badge counts for the manager tabs. */
export function getPendingLaborCounts(): { swaps: number; excuses: number } {
  const swaps = db.select({ id: jobSwapRequests.id }).from(jobSwapRequests).where(inArray(jobSwapRequests.status, ["pending", "accepted"])).all().length;
  const excuses = db.select({ id: excuseRequests.id, assignmentId: excuseRequests.assignmentId }).from(excuseRequests).where(eq(excuseRequests.status, "pending")).all().filter((r) => r.assignmentId != null).length;
  return { swaps, excuses };
}

/** Open requests (swap or excuse) per assignment id, so "My jobs" can show what is pending. */
export function getOpenRequestsFor(memberId: number): { swaps: SwapRequestDetail[]; excuses: ExcuseRequestDetail[] } {
  return {
    swaps: listSwapRequests({ status: ["pending", "accepted"], memberId }),
    excuses: listExcuseRequests({ status: ["pending"], memberId }),
  };
}
