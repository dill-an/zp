/**
 * Pure labor logic: due dates, assignment state, auto-fill and fairness math.
 * No database access, so everything here is unit tested in labor-logic.test.ts.
 */
import type { AssignmentStatus, JobKind, LaborGroup } from "@/db/schema";
import { addDaysISO, dayOfWeek, formatDate } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type JobTypeLike = {
  id: number;
  name: string;
  kind: JobKind;
  category: string;
  windowLabel?: string | null;
  startOffsetDays: number;
  dueOffsetDays: number;
  slots: number;
  points: number;
  sortOrder?: number;
  isActive?: boolean;
};

export type AssignmentLike = {
  id?: number;
  jobTypeId: number;
  memberId: number;
  slot: number;
  status: AssignmentStatus;
  completedAt?: string | null;
  verifiedAt?: string | null;
  verifiedById?: number | null;
};

export type PoolMember = { id: number; laborGroup: LaborGroup };

/** Display state of an assignment, derived from its status, due date and the tracking start. */
export type AssignmentState = "not_tracked" | "upcoming" | "due_today" | "overdue" | "done" | "verified" | "missed" | "excused";

/* ------------------------------------------------------------------ */
/* Dates and state                                                     */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed, real "YYYY-MM-DD" date. */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

export function isSunday(date: string): boolean {
  return dayOfWeek(date) === 0;
}

/** Calendar date on which an assignment is due: the week's Sunday plus the job's due offset. */
export function dueDateFor(weekStart: string, jobType: Pick<JobTypeLike, "dueOffsetDays">): string {
  return addDaysISO(weekStart, jobType.dueOffsetDays);
}

/** Calendar date on which an assignment may start. */
export function startDateFor(weekStart: string, jobType: Pick<JobTypeLike, "startOffsetDays">): string {
  return addDaysISO(weekStart, jobType.startOffsetDays);
}

/**
 * Derive the display state. Weeks that start before `trackingStart` are "not tracked": an
 * `assigned` job there is never overdue. Statuses a manager set explicitly always win.
 */
export function assignmentState(
  assignment: Pick<AssignmentLike, "status" | "verifiedAt">,
  jobType: Pick<JobTypeLike, "dueOffsetDays">,
  weekStart: string,
  today: string,
  trackingStart: string,
): AssignmentState {
  switch (assignment.status) {
    case "missed":
      return "missed";
    case "excused":
      return "excused";
    case "done":
      return assignment.verifiedAt ? "verified" : "done";
    default: {
      if (weekStart < trackingStart) return "not_tracked";
      const due = dueDateFor(weekStart, jobType);
      if (due < today) return "overdue";
      if (due === today) return "due_today";
      return "upcoming";
    }
  }
}

/** Status string and label for a StatusPill, reusing tones the shared STATUS_TONES already define. */
export function statePill(state: AssignmentState): { status: string; label: string } {
  switch (state) {
    case "not_tracked":
      return { status: "not_tracked", label: "Not tracked" };
    case "upcoming":
      return { status: "assigned", label: "Upcoming" };
    case "due_today":
      return { status: "pending", label: "Due today" };
    case "overdue":
      return { status: "overdue", label: "Overdue" };
    case "done":
      return { status: "done", label: "Done" };
    case "verified":
      return { status: "verified", label: "Verified" };
    case "missed":
      return { status: "missed", label: "Missed" };
    case "excused":
      return { status: "excused", label: "Excused" };
  }
}

/** Tailwind classes for the compact job chips on the brothers matrix. */
export function stateChipClass(state: AssignmentState): string {
  switch (state) {
    case "done":
    case "verified":
      return "bg-success-soft text-success";
    case "missed":
      return "bg-danger-soft text-danger";
    case "overdue":
      return "bg-danger-soft text-danger";
    case "excused":
      return "bg-warning-soft text-warning";
    case "due_today":
      return "bg-warning-soft text-warning";
    case "upcoming":
      return "bg-info-soft text-info";
    case "not_tracked":
      return "bg-surface-2 text-muted";
  }
}

/* ------------------------------------------------------------------ */
/* Job type helpers                                                    */
/* ------------------------------------------------------------------ */

const CATEGORY_ORDER = ["commons", "bathroom", "kitchen", "meal", "trash", "yard", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  commons: "Commons",
  bathroom: "Bathrooms",
  kitchen: "Kitchen",
  meal: "Meals",
  trash: "Trash",
  yard: "Yard",
  other: "Other",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Sort job types by category (Commons, Bathrooms, Kitchen, then the rest) and then by sortOrder/id. */
export function sortJobTypes<T extends Pick<JobTypeLike, "id" | "category" | "sortOrder">>(jobTypes: T[]): T[] {
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...jobTypes].sort((a, b) => rank(a.category) - rank(b.category) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
}

/** Group job types by category in display order. Empty categories are omitted. */
export function groupJobTypesByCategory<T extends Pick<JobTypeLike, "id" | "category" | "sortOrder">>(jobTypes: T[]): { category: string; label: string; jobTypes: T[] }[] {
  const sorted = sortJobTypes(jobTypes);
  const groups: { category: string; label: string; jobTypes: T[] }[] = [];
  for (const jt of sorted) {
    let g = groups.find((x) => x.category === jt.category);
    if (!g) {
      g = { category: jt.category, label: categoryLabel(jt.category), jobTypes: [] };
      groups.push(g);
    }
    g.jobTypes.push(jt);
  }
  return groups;
}

const SHORT_WORDS: [RegExp, string][] = [
  [/\bMonday\b/g, "Mon"],
  [/\bTuesday\b/g, "Tue"],
  [/\bWednesday\b/g, "Wed"],
  [/\bThursday\b/g, "Thu"],
  [/\bFriday\b/g, "Fri"],
  [/\bSaturday\b/g, "Sat"],
  [/\bSunday\b/g, "Sun"],
  [/\b(\d+)(st|nd|rd|th) Floor\b/g, "$1F"],
  [/\bBasement\b/g, "Bsmt"],
  [/\bUpstairs\b/g, "Up"],
  [/\bDownstairs\b/g, "Down"],
  [/\bBathroom\b/g, "Bath"],
];

/** Compact label for grid chips: "2nd Floor Bathroom" -> "2F Bath", "Monday Kitchen" -> "Mon Kitchen". */
export function shortJobName(name: string): string {
  let out = name;
  for (const [re, rep] of SHORT_WORDS) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Auto-fill                                                           */
/* ------------------------------------------------------------------ */

export type AutoFillInput = {
  weekStart: string;
  /** Active job types to fill, any order. */
  jobTypes: JobTypeLike[];
  /** Assignments already present in the week. */
  existing: Pick<AssignmentLike, "jobTypeId" | "memberId" | "slot">[];
  /** Members eligible for labor. */
  pool: PoolMember[];
  /** Semester points already carried by each member (memberId -> points). */
  loads: Record<number, number> | Map<number, number>;
  /** Most jobs one brother gets in the week before the rest of the pool is considered exhausted. */
  cap?: number;
};

export type AutoFillPick = { jobTypeId: number; memberId: number; slot: number };

/** Default per-week cap: nobody gets a third job while someone else is still under two. */
export const AUTO_FILL_WEEK_CAP = 2;

/**
 * Fill every empty slot deterministically. Candidates are ranked by jobs already assigned this
 * week (existing rows count), then semester points, then lowest id, so the load spreads across the
 * week before it spreads across the semester. Never the same brother twice in one job type.
 *
 * The labor group is a soft preference: cleans-group brothers are tried first for `clean` jobs and
 * cooks for `cook` jobs, but only while they are under the per-week cap; once the matching group is
 * at the cap (or all of them already hold a slot on this job) the slot opens to the whole pool.
 * Only when everyone is at the cap is it lifted, so a tiny pool still fills every slot.
 */
export function autoFill(input: AutoFillInput): AutoFillPick[] {
  const cap = Math.max(1, input.cap ?? AUTO_FILL_WEEK_CAP);
  const loadOf = (id: number): number => {
    const v = input.loads instanceof Map ? input.loads.get(id) : input.loads[id];
    return v ?? 0;
  };
  const points = new Map<number, number>();
  const weekJobs = new Map<number, number>();
  const pool = [...input.pool].sort((a, b) => a.id - b.id);
  for (const m of pool) {
    points.set(m.id, loadOf(m.id));
    weekJobs.set(m.id, 0);
  }
  const jobsOf = (id: number) => weekJobs.get(id) ?? 0;
  const taken = new Map<number, Map<number, number>>(); // jobTypeId -> slot -> memberId
  for (const a of input.existing) {
    (taken.get(a.jobTypeId) ?? taken.set(a.jobTypeId, new Map()).get(a.jobTypeId)!).set(a.slot, a.memberId);
    if (weekJobs.has(a.memberId)) weekJobs.set(a.memberId, jobsOf(a.memberId) + 1);
  }

  const picks: AutoFillPick[] = [];
  const jobTypes = sortJobTypes(input.jobTypes.filter((jt) => jt.isActive !== false));
  for (const jt of jobTypes) {
    const slotMap = taken.get(jt.id) ?? new Map<number, number>();
    const preferredGroup: LaborGroup | null = jt.kind === "clean" ? "cleans" : jt.kind === "cook" ? "cooks" : null;
    for (let slot = 1; slot <= Math.max(1, jt.slots); slot++) {
      if (slotMap.has(slot)) continue;
      const already = new Set(slotMap.values());
      const eligible = pool.filter((m) => !already.has(m.id));
      const underCap = eligible.filter((m) => jobsOf(m.id) < cap);
      const preferredUnderCap = preferredGroup ? underCap.filter((m) => m.laborGroup === preferredGroup) : [];
      // Tiers: matching group under the cap, anyone under the cap, then (pool exhausted) anyone at all.
      const candidates = preferredUnderCap.length ? preferredUnderCap : underCap.length ? underCap : eligible;
      if (!candidates.length) continue;
      candidates.sort((a, b) => jobsOf(a.id) - jobsOf(b.id) || (points.get(a.id) ?? 0) - (points.get(b.id) ?? 0) || a.id - b.id);
      const chosen = candidates[0];
      slotMap.set(slot, chosen.id);
      taken.set(jt.id, slotMap);
      points.set(chosen.id, (points.get(chosen.id) ?? 0) + jt.points);
      weekJobs.set(chosen.id, (weekJobs.get(chosen.id) ?? 0) + 1);
      picks.push({ jobTypeId: jt.id, memberId: chosen.id, slot });
    }
  }
  return picks;
}

/* ------------------------------------------------------------------ */
/* Fairness stats                                                      */
/* ------------------------------------------------------------------ */

export type StatsAssignment = Pick<AssignmentLike, "jobTypeId" | "memberId" | "status" | "verifiedAt"> & {
  /** The week's Sunday; needed to tell untracked history apart (see `StatsOptions.trackingStart`). */
  weekStart?: string;
};
export type StatsMember = { id: number; laborGroup: LaborGroup; firstName: string; lastName: string; preferredName: string };

/** Which part of the pool the median, the below-median flag and the threshold list are measured against. */
export type StatsScope = "all" | "cleans" | "cooks";

export type StatsOptions = {
  scope?: StatsScope;
  /** Open assignments in weeks before this date are "not tracked": they never count as pending, done or missed. */
  trackingStart?: string | null;
};

export type MemberStat = {
  memberId: number;
  laborGroup: LaborGroup;
  /** Every assignment regardless of status. */
  assigned: number;
  /** Still open (status assigned) in a tracked week. */
  pending: number;
  /** Open assignments from before tracking started: credit for the job, but no verdict either way. */
  notTracked: number;
  done: number;
  verified: number;
  missed: number;
  excused: number;
  /** Assignments that count as labor credit: assigned or done. */
  jobs: number;
  /** Points for assigned or done jobs. */
  points: number;
  /** Share of resolved tracked jobs (done or missed) that were done, 0-100; null until one is resolved. */
  donePct: number | null;
  /** Below the median points of the stats' scope (only ever true for pool members inside that scope). */
  belowMedian: boolean;
};

export type JobTypeStat = {
  jobTypeId: number;
  name: string;
  total: number;
  done: number;
  missed: number;
  byMember: { memberId: number; count: number }[];
};

export type GroupStat = { group: LaborGroup; size: number; jobs: number; points: number; avgJobs: number; avgPoints: number };

export type LaborStats = {
  perMember: MemberStat[];
  perJobType: JobTypeStat[];
  groups: GroupStat[];
  scope: StatsScope;
  /** Median over pool members inside `scope`. */
  medianPoints: number;
  medianJobs: number;
  totals: { assignments: number; done: number; missed: number; excused: number; notTracked: number; points: number };
};

/** Share of resolved jobs that were done, as a whole percentage; null when nothing has been resolved yet. */
export function donePercent(done: number, missed: number): number | null {
  const resolved = done + missed;
  return resolved ? Math.round((done / resolved) * 100) : null;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Totals per member and per job type. `members` is the labor pool; others with assignments are added.
 * With `trackingStart`, open assignments in earlier weeks are counted as `notTracked` instead of pending
 * (they still earn job credit and points). With `scope`, the median and the below-median flag cover only
 * that labor group, so cooks are measured against cooks and cleans against cleans.
 */
export function laborStats(assignments: StatsAssignment[], jobTypes: Pick<JobTypeLike, "id" | "name" | "points">[], members: StatsMember[], opts: StatsOptions = {}): LaborStats {
  const scope: StatsScope = opts.scope ?? "all";
  const trackingStart = opts.trackingStart || null;
  const jobTypeById = new Map(jobTypes.map((jt) => [jt.id, jt]));
  const perMember = new Map<number, MemberStat>();
  const blank = (memberId: number, laborGroup: LaborGroup): MemberStat => ({
    memberId,
    laborGroup,
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
  });
  for (const m of members) perMember.set(m.id, blank(m.id, m.laborGroup));

  const perJob = new Map<number, JobTypeStat & { counts: Map<number, number> }>();
  for (const jt of jobTypes) perJob.set(jt.id, { jobTypeId: jt.id, name: jt.name, total: 0, done: 0, missed: 0, byMember: [], counts: new Map() });

  const totals = { assignments: 0, done: 0, missed: 0, excused: 0, notTracked: 0, points: 0 };
  for (const a of assignments) {
    const jt = jobTypeById.get(a.jobTypeId);
    const pts = jt?.points ?? 1;
    const ms = perMember.get(a.memberId) ?? perMember.set(a.memberId, blank(a.memberId, "none")).get(a.memberId)!;
    ms.assigned += 1;
    totals.assignments += 1;
    if (a.status === "done") {
      ms.done += 1;
      totals.done += 1;
      if (a.verifiedAt) ms.verified += 1;
    } else if (a.status === "missed") {
      ms.missed += 1;
      totals.missed += 1;
    } else if (a.status === "excused") {
      ms.excused += 1;
      totals.excused += 1;
    } else if (trackingStart && a.weekStart && a.weekStart < trackingStart) {
      ms.notTracked += 1;
      totals.notTracked += 1;
    } else {
      ms.pending += 1;
    }
    if (a.status === "done" || a.status === "assigned" || a.status === "swapped") {
      ms.jobs += 1;
      ms.points += pts;
      totals.points += pts;
    }
    const js = perJob.get(a.jobTypeId);
    if (js) {
      js.total += 1;
      if (a.status === "done") js.done += 1;
      if (a.status === "missed") js.missed += 1;
      if (a.status !== "missed" && a.status !== "excused") js.counts.set(a.memberId, (js.counts.get(a.memberId) ?? 0) + 1);
    }
  }

  const poolIds = new Set(members.map((m) => m.id));
  const poolStats = [...perMember.values()].filter((s) => poolIds.has(s.memberId));
  const inScope = (s: MemberStat) => poolIds.has(s.memberId) && (scope === "all" || s.laborGroup === scope);
  const scoped = poolStats.filter(inScope);
  const medianPoints = median(scoped.map((s) => s.points));
  const medianJobs = median(scoped.map((s) => s.jobs));
  for (const s of perMember.values()) {
    s.donePct = donePercent(s.done, s.missed);
    s.belowMedian = inScope(s) && s.points < medianPoints;
  }

  const groups: GroupStat[] = (["cleans", "cooks"] as LaborGroup[]).map((group) => {
    const rows = poolStats.filter((s) => s.laborGroup === group);
    const jobs = rows.reduce((n, s) => n + s.jobs, 0);
    const points = rows.reduce((n, s) => n + s.points, 0);
    return {
      group,
      size: rows.length,
      jobs,
      points,
      avgJobs: rows.length ? Math.round((jobs / rows.length) * 10) / 10 : 0,
      avgPoints: rows.length ? Math.round((points / rows.length) * 10) / 10 : 0,
    };
  });

  const perJobType: JobTypeStat[] = [...perJob.values()].map((js) => ({
    jobTypeId: js.jobTypeId,
    name: js.name,
    total: js.total,
    done: js.done,
    missed: js.missed,
    byMember: [...js.counts.entries()].map(([memberId, count]) => ({ memberId, count })).sort((a, b) => b.count - a.count || a.memberId - b.memberId),
  }));

  return {
    perMember: [...perMember.values()].sort((a, b) => a.points - b.points || a.jobs - b.jobs || a.memberId - b.memberId),
    perJobType,
    groups,
    scope,
    medianPoints,
    medianJobs,
    totals,
  };
}

/**
 * Members with fewer credited jobs than `min` (the sheet's "brothers who have not cleaned twice"),
 * limited to the stats' scope when it names one labor group.
 */
export function belowThreshold(stats: Pick<LaborStats, "perMember"> & { scope?: StatsScope }, min: number): MemberStat[] {
  const scope = stats.scope ?? "all";
  return stats.perMember
    .filter((s) => s.jobs < min && (scope === "all" || s.laborGroup === scope))
    .sort((a, b) => a.jobs - b.jobs || a.memberId - b.memberId);
}

/** Points carried by each member, in the shape `autoFill` expects as `loads`. */
export function loadsFromStats(stats: Pick<LaborStats, "perMember">): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of stats.perMember) out[s.memberId] = s.points;
  return out;
}

/* ------------------------------------------------------------------ */
/* Plain text for the group chat                                       */
/* ------------------------------------------------------------------ */

export type ScheduleTextRow = { name: string; windowLabel?: string | null; names: (string | null)[] };
export type ScheduleTextGroup = { label: string; rows: ScheduleTextRow[] };

/** "Upstairs Commons (Mon-Wed)" but plain "Monday Kitchen", whose name already says the day. */
export function jobTextLabel(name: string, windowLabel?: string | null): string {
  const w = windowLabel?.trim();
  if (!w) return name;
  return shortJobName(name).toLowerCase().includes(w.toLowerCase()) ? name : `${name} (${w})`;
}

/**
 * The week's schedule as plain text grouped by category, one job per line, for pasting into the
 * house group chat. Empty slots read "open"; week notes close the message.
 */
export function scheduleText(input: { weekStart: string; groups: ScheduleTextGroup[]; notes?: string | null }): string {
  const blocks: string[] = [`Jobs for the week of ${formatDate(input.weekStart)}`];
  for (const g of input.groups) {
    if (!g.rows.length) continue;
    const lines = g.rows.map((r) => `${jobTextLabel(r.name, r.windowLabel)}: ${r.names.map((n) => n?.trim() || "open").join(", ")}`);
    blocks.push([g.label, ...lines].join("\n"));
  }
  const notes = input.notes?.trim();
  if (notes) blocks.push(`Notes: ${notes}`);
  return blocks.join("\n\n");
}

export type MyJobsTextSection = { label: string; jobs: { name: string; windowLabel?: string | null; dueDate: string }[] };

/** One brother's jobs as plain text: a heading, then one section per week with a line per job. */
export function myJobsText(input: { title: string; sections: MyJobsTextSection[] }): string {
  const blocks: string[] = [input.title];
  for (const s of input.sections) {
    const lines = s.jobs.length ? s.jobs.map((j) => `- ${jobTextLabel(j.name, j.windowLabel)}, due ${formatDate(j.dueDate, { weekday: true })}`) : ["- nothing assigned"];
    blocks.push([s.label, ...lines].join("\n"));
  }
  return blocks.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Week helpers                                                        */
/* ------------------------------------------------------------------ */

/** Previous Sunday. */
export function previousWeekStart(weekStart: string): string {
  return addDaysISO(weekStart, -7);
}

/** Next Sunday. */
export function nextWeekStart(weekStart: string): string {
  return addDaysISO(weekStart, 7);
}

/** True when nothing in the list has been done, verified or otherwise resolved (safe to delete the week). */
export function weekIsUntouched(assignments: Pick<AssignmentLike, "status" | "completedAt" | "verifiedAt">[]): boolean {
  return assignments.every((a) => a.status === "assigned" && !a.completedAt && !a.verifiedAt);
}
