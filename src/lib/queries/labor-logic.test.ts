import { describe, expect, it } from "vitest";
import {
  assignmentState,
  autoFill,
  belowThreshold,
  dueDateFor,
  groupJobTypesByCategory,
  isSunday,
  isValidISODate,
  laborStats,
  loadsFromStats,
  median,
  nextWeekStart,
  previousWeekStart,
  shortJobName,
  sortJobTypes,
  startDateFor,
  statePill,
  weekIsUntouched,
  type JobTypeLike,
  type StatsMember,
} from "./labor-logic";

const jt = (over: Partial<JobTypeLike> & { id: number }): JobTypeLike => ({
  name: `Job ${over.id}`,
  kind: "clean",
  category: "kitchen",
  windowLabel: "Mon",
  startOffsetDays: 1,
  dueOffsetDays: 1,
  slots: 1,
  points: 1,
  sortOrder: over.id,
  isActive: true,
  ...over,
});

const commons = jt({ id: 1, name: "Upstairs Commons", category: "commons", startOffsetDays: 1, dueOffsetDays: 3, sortOrder: 0 });
const bathroom = jt({ id: 4, name: "2nd Floor Bathroom", category: "bathroom", startOffsetDays: 7, dueOffsetDays: 7, sortOrder: 3 });
const monKitchen = jt({ id: 7, name: "Monday Kitchen", slots: 2, sortOrder: 6 });
const sunKitchen = jt({ id: 12, name: "Sunday Kitchen", slots: 2, startOffsetDays: 7, dueOffsetDays: 7, sortOrder: 11 });

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isValidISODate("2026-10-18")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("garbage")).toBe(false);
    expect(isValidISODate("2026-1-5")).toBe(false);
  });

  it("knows Sundays and neighbouring weeks", () => {
    expect(isSunday("2026-10-18")).toBe(true);
    expect(isSunday("2026-10-19")).toBe(false);
    expect(previousWeekStart("2026-10-18")).toBe("2026-10-11");
    expect(nextWeekStart("2026-10-18")).toBe("2026-10-25");
  });

  it("computes due and start dates from the week's Sunday", () => {
    expect(dueDateFor("2026-10-18", commons)).toBe("2026-10-21");
    expect(dueDateFor("2026-10-18", bathroom)).toBe("2026-10-25");
    expect(dueDateFor("2026-10-18", monKitchen)).toBe("2026-10-19");
    expect(startDateFor("2026-10-18", commons)).toBe("2026-10-19");
    expect(startDateFor("2026-10-18", { startOffsetDays: 0 })).toBe("2026-10-18");
  });
});

describe("assignmentState", () => {
  const tracking = "2026-10-18";
  it("treats weeks before the tracking start as not tracked", () => {
    expect(assignmentState({ status: "assigned" }, commons, "2026-10-11", "2026-10-18", tracking)).toBe("not_tracked");
    expect(assignmentState({ status: "assigned" }, bathroom, "2026-09-13", "2026-12-01", tracking)).toBe("not_tracked");
  });

  it("derives upcoming, due today and overdue for tracked weeks", () => {
    expect(assignmentState({ status: "assigned" }, commons, "2026-10-18", "2026-10-18", tracking)).toBe("upcoming");
    expect(assignmentState({ status: "assigned" }, commons, "2026-10-18", "2026-10-21", tracking)).toBe("due_today");
    expect(assignmentState({ status: "assigned" }, commons, "2026-10-18", "2026-10-22", tracking)).toBe("overdue");
  });

  it("lets explicit statuses win, even before tracking", () => {
    expect(assignmentState({ status: "done" }, commons, "2026-09-13", "2026-10-18", tracking)).toBe("done");
    expect(assignmentState({ status: "done", verifiedAt: "2026-10-18T00:00:00.000Z" }, commons, "2026-10-18", "2026-10-30", tracking)).toBe("verified");
    expect(assignmentState({ status: "missed" }, commons, "2026-09-13", "2026-10-18", tracking)).toBe("missed");
    expect(assignmentState({ status: "excused" }, commons, "2026-10-18", "2026-10-18", tracking)).toBe("excused");
  });

  it("maps every state to a pill", () => {
    expect(statePill("not_tracked")).toEqual({ status: "not_tracked", label: "Not tracked" });
    expect(statePill("overdue").status).toBe("overdue");
    expect(statePill("verified").label).toBe("Verified");
    expect(statePill("upcoming").status).toBe("assigned");
  });
});

describe("job type helpers", () => {
  it("orders categories Commons, Bathrooms, Kitchen, then others", () => {
    const yard = jt({ id: 20, category: "yard", sortOrder: -5 });
    const groups = groupJobTypesByCategory([sunKitchen, yard, bathroom, monKitchen, commons]);
    expect(groups.map((g) => g.label)).toEqual(["Commons", "Bathrooms", "Kitchen", "Yard"]);
    expect(groups[2].jobTypes.map((j) => j.id)).toEqual([7, 12]);
    expect(sortJobTypes([sunKitchen, commons]).map((j) => j.id)).toEqual([1, 12]);
  });

  it("shortens job names for chips", () => {
    expect(shortJobName("2nd Floor Bathroom")).toBe("2F Bath");
    expect(shortJobName("Monday Kitchen")).toBe("Mon Kitchen");
    expect(shortJobName("Basement Bathroom")).toBe("Bsmt Bath");
    expect(shortJobName("Upstairs Commons")).toBe("Up Commons");
    expect(shortJobName("Trash run")).toBe("Trash run");
  });
});

describe("autoFill", () => {
  const pool = [
    { id: 1, laborGroup: "cleans" as const },
    { id: 2, laborGroup: "cleans" as const },
    { id: 3, laborGroup: "cooks" as const },
    { id: 4, laborGroup: "cooks" as const },
  ];

  it("fills empty slots with the lowest-load eligible brother and is deterministic", () => {
    const input = { weekStart: "2026-10-18", jobTypes: [monKitchen, commons], existing: [], pool, loads: { 1: 5, 2: 0, 3: 0, 4: 0 } };
    const a = autoFill(input);
    const b = autoFill(input);
    expect(a).toEqual(b);
    // Commons first (category order), one slot: cleans preferred, lowest points -> member 2.
    expect(a[0]).toEqual({ jobTypeId: 1, memberId: 2, slot: 1 });
    // Monday Kitchen has two slots; member 2 now carries 1 point, member 1 has 5, so 2 then 1.
    expect(a.slice(1)).toEqual([
      { jobTypeId: 7, memberId: 2, slot: 1 },
      { jobTypeId: 7, memberId: 1, slot: 2 },
    ]);
  });

  it("never puts the same brother twice in one job and respects existing slots", () => {
    const picks = autoFill({
      weekStart: "2026-10-18",
      jobTypes: [monKitchen],
      existing: [{ jobTypeId: 7, memberId: 2, slot: 1 }],
      pool,
      loads: { 1: 3, 2: 0 },
    });
    expect(picks).toEqual([{ jobTypeId: 7, memberId: 1, slot: 2 }]);
  });

  it("falls back to the whole pool when no preferred-group member is free", () => {
    const picks = autoFill({
      weekStart: "2026-10-18",
      jobTypes: [jt({ id: 9, slots: 3 })],
      existing: [],
      pool,
      loads: {},
    });
    expect(picks.map((p) => p.memberId)).toEqual([1, 2, 3]);
  });

  it("prefers cooks for cook jobs and spreads jobs within the week", () => {
    const cook = jt({ id: 30, kind: "cook", category: "meal", slots: 1 });
    const cook2 = jt({ id: 31, kind: "cook", category: "meal", slots: 1 });
    const picks = autoFill({ weekStart: "2026-10-18", jobTypes: [cook, cook2], existing: [], pool, loads: {} });
    expect(picks.map((p) => p.memberId)).toEqual([3, 4]);
  });

  it("skips inactive job types and accepts a Map of loads", () => {
    const inactive = jt({ id: 40, isActive: false });
    const picks = autoFill({ weekStart: "2026-10-18", jobTypes: [inactive, commons], existing: [], pool, loads: new Map([[2, 9]]) });
    expect(picks).toEqual([{ jobTypeId: 1, memberId: 1, slot: 1 }]);
  });

  it("returns nothing when the pool is empty", () => {
    expect(autoFill({ weekStart: "2026-10-18", jobTypes: [commons], existing: [], pool: [], loads: {} })).toEqual([]);
  });
});

describe("laborStats", () => {
  const members: StatsMember[] = [
    { id: 1, laborGroup: "cleans", firstName: "A", lastName: "A", preferredName: "A" },
    { id: 2, laborGroup: "cleans", firstName: "B", lastName: "B", preferredName: "B" },
    { id: 3, laborGroup: "cooks", firstName: "C", lastName: "C", preferredName: "C" },
  ];
  const twoPoint = jt({ id: 50, name: "Deep clean", points: 2 });
  const assignments = [
    { jobTypeId: 1, memberId: 1, status: "done" as const, verifiedAt: "x" },
    { jobTypeId: 7, memberId: 1, status: "assigned" as const },
    { jobTypeId: 7, memberId: 1, status: "missed" as const },
    { jobTypeId: 50, memberId: 2, status: "done" as const },
    { jobTypeId: 1, memberId: 2, status: "excused" as const },
    { jobTypeId: 1, memberId: 99, status: "assigned" as const },
  ];

  it("totals per member, counting only assigned/done as credit", () => {
    const stats = laborStats(assignments, [commons, monKitchen, twoPoint], members);
    const a = stats.perMember.find((s) => s.memberId === 1)!;
    expect(a).toMatchObject({ assigned: 3, pending: 1, done: 1, verified: 1, missed: 1, excused: 0, jobs: 2, points: 2 });
    const b = stats.perMember.find((s) => s.memberId === 2)!;
    expect(b).toMatchObject({ assigned: 2, done: 1, excused: 1, jobs: 1, points: 2 });
    const c = stats.perMember.find((s) => s.memberId === 3)!;
    expect(c).toMatchObject({ assigned: 0, jobs: 0, points: 0 });
    // Member 99 is not in the pool but still appears.
    expect(stats.perMember.find((s) => s.memberId === 99)).toMatchObject({ laborGroup: "none", jobs: 1 });
    expect(stats.totals).toEqual({ assignments: 6, done: 2, missed: 1, excused: 1, points: 5 });
  });

  it("computes per job type usage and who has done it", () => {
    const stats = laborStats(assignments, [commons, monKitchen, twoPoint], members);
    const kitchen = stats.perJobType.find((j) => j.jobTypeId === 7)!;
    expect(kitchen).toMatchObject({ total: 2, done: 0, missed: 1 });
    expect(kitchen.byMember).toEqual([{ memberId: 1, count: 1 }]);
    const c = stats.perJobType.find((j) => j.jobTypeId === 1)!;
    expect(c.byMember).toEqual([
      { memberId: 1, count: 1 },
      { memberId: 99, count: 1 },
    ]);
  });

  it("computes group sizes, averages and the median", () => {
    const stats = laborStats(assignments, [commons, monKitchen, twoPoint], members);
    const cleans = stats.groups.find((g) => g.group === "cleans")!;
    expect(cleans).toMatchObject({ size: 2, jobs: 3, points: 4, avgJobs: 1.5, avgPoints: 2 });
    const cooks = stats.groups.find((g) => g.group === "cooks")!;
    expect(cooks).toMatchObject({ size: 1, jobs: 0, avgJobs: 0 });
    expect(stats.medianPoints).toBe(2);
    expect(stats.perMember.find((s) => s.memberId === 3)!.belowMedian).toBe(true);
    expect(stats.perMember.find((s) => s.memberId === 1)!.belowMedian).toBe(false);
  });

  it("lists brothers below a job threshold and exports loads", () => {
    const stats = laborStats(assignments, [commons, monKitchen, twoPoint], members);
    expect(belowThreshold(stats, 2).map((s) => s.memberId)).toEqual([3, 2, 99]);
    expect(belowThreshold(stats, 1).map((s) => s.memberId)).toEqual([3]);
    expect(loadsFromStats(stats)).toEqual({ 1: 2, 2: 2, 3: 0, 99: 1 });
  });

  it("median handles even and empty lists", () => {
    expect(median([])).toBe(0);
    expect(median([1, 3])).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("weekIsUntouched", () => {
  it("is true only when every assignment is plain assigned", () => {
    expect(weekIsUntouched([])).toBe(true);
    expect(weekIsUntouched([{ status: "assigned" }])).toBe(true);
    expect(weekIsUntouched([{ status: "assigned" }, { status: "done", completedAt: "x" }])).toBe(false);
    expect(weekIsUntouched([{ status: "missed" }])).toBe(false);
  });
});
