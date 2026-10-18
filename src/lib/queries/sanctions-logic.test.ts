import { describe, expect, it } from "vitest";
import {
  allowedActions,
  appendAppealNote,
  filterSanctions,
  isOverdue,
  isSanctionTab,
  nextStatus,
  NO_JOB_LABEL,
  sanctionStats,
  sortSanctions,
  splitForMember,
  summarizeJobs,
  type SanctionLike,
} from "./sanctions-logic";

const NOW = new Date("2026-10-18T16:00:00.000Z");

let nextId = 1;
function s(over: Partial<SanctionLike> = {}): SanctionLike {
  return {
    id: nextId++,
    memberId: 1,
    status: "open",
    source: "manual",
    reason: "Missed clean",
    jobDescription: "Deep clean kitchen",
    hours: 2,
    fineCents: 2500,
    dueAt: "2026-10-20T23:00:00.000Z",
    issuedAt: "2026-10-15T12:00:00.000Z",
    notes: null,
    memberName: "Gio Mandwee",
    ...over,
  };
}

describe("isOverdue", () => {
  it("is true for an open sanction past its due instant", () => {
    expect(isOverdue(s({ dueAt: "2026-10-17T23:00:00.000Z" }), NOW)).toBe(true);
    expect(isOverdue(s({ status: "in_progress", dueAt: "2026-10-17T23:00:00.000Z" }), NOW)).toBe(true);
    expect(isOverdue(s({ status: "appealed", dueAt: "2026-10-17T23:00:00.000Z" }), NOW)).toBe(true);
  });
  it("is false when due is in the future, missing or the job is no longer outstanding", () => {
    expect(isOverdue(s({ dueAt: "2026-10-19T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(s({ dueAt: null }), NOW)).toBe(false);
    expect(isOverdue(s({ status: "completed", dueAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(s({ status: "verified", dueAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(s({ status: "waived", dueAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(s({ dueAt: "not a date" }), NOW)).toBe(false);
  });
  it("treats the exact due instant as not yet overdue", () => {
    expect(isOverdue(s({ dueAt: NOW.toISOString() }), NOW)).toBe(false);
  });
});

describe("sanctionStats", () => {
  it("counts open, overdue, to-verify, appealed, hours and fines", () => {
    const list = [
      s({ id: 1, status: "open", hours: 2, fineCents: 2500, dueAt: "2026-10-10T00:00:00.000Z" }), // overdue
      s({ id: 2, status: "in_progress", hours: 3, fineCents: null, dueAt: "2026-11-01T00:00:00.000Z" }),
      s({ id: 3, status: "completed", hours: 1, fineCents: 1000 }),
      s({ id: 4, status: "appealed", hours: 4, fineCents: 500, dueAt: "2026-10-01T00:00:00.000Z" }), // overdue
      s({ id: 5, status: "verified", hours: 5, fineCents: 9900 }),
      s({ id: 6, status: "waived", hours: 6, fineCents: 7000 }),
    ];
    const charges = [
      { sanctionId: 1, kind: "fine", amountCents: 2500 },
      { sanctionId: 5, kind: "fine", amountCents: 9900 },
      { sanctionId: 6, kind: "fine", amountCents: 7000 },
      { sanctionId: 6, kind: "credit", amountCents: -7000 },
      { sanctionId: null, kind: "fine", amountCents: 100000 }, // unlinked: ignored
    ];
    const stats = sanctionStats(list, charges, NOW);
    expect(stats.open).toBe(2);
    expect(stats.overdue).toBe(2);
    expect(stats.toVerify).toBe(1);
    expect(stats.appealed).toBe(1);
    expect(stats.outstandingHours).toBe(2 + 3 + 4);
    // linked fine charges for 1 and 5, fineCents fallback for 3 and 4 (no charge rows), waived 6 excluded
    expect(stats.outstandingFines).toBe(2500 + 9900 + 1000 + 500);
    expect(stats.total).toBe(6);
  });
  it("prefers linked fine charges over fineCents when both exist", () => {
    const stats = sanctionStats([s({ id: 9, fineCents: 100 })], [{ sanctionId: 9, kind: "fine", amountCents: 4200 }], NOW);
    expect(stats.outstandingFines).toBe(4200);
  });
  it("handles an empty list", () => {
    expect(sanctionStats([], [], NOW)).toEqual({ open: 0, overdue: 0, toVerify: 0, appealed: 0, outstandingHours: 0, outstandingFines: 0, total: 0 });
  });
});

describe("filterSanctions", () => {
  const list = [
    s({ id: 1, status: "open", memberId: 1, source: "manual", reason: "Loud after quiet hours", memberName: "Gio Mandwee" }),
    s({ id: 2, status: "in_progress", memberId: 2, source: "missed_clean", reason: "Skipped kitchen clean", memberName: "Martin Meister" }),
    s({ id: 3, status: "completed", memberId: 1, source: "missed_meeting", reason: "Missed house meeting" }),
    s({ id: 4, status: "appealed", memberId: 3, source: "conduct", reason: "Broke a window", jobDescription: null, notes: "Says it was already cracked" }),
    s({ id: 5, status: "verified", memberId: 2, source: "manual", reason: "Late dues", memberName: "Martin Meister" }),
    s({ id: 6, status: "waived", memberId: 1, source: "other", reason: "Duplicate entry" }),
  ];
  const ids = (xs: SanctionLike[]) => xs.map((x) => x.id);

  it("maps tabs to statuses", () => {
    expect(ids(filterSanctions(list, "open"))).toEqual([1, 2]);
    expect(ids(filterSanctions(list, "to_verify"))).toEqual([3]);
    expect(ids(filterSanctions(list, "appealed"))).toEqual([4]);
    expect(ids(filterSanctions(list, "verified"))).toEqual([5]);
    expect(ids(filterSanctions(list, "waived"))).toEqual([6]);
    expect(ids(filterSanctions(list, "all"))).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("filters by member and source", () => {
    expect(ids(filterSanctions(list, "all", { memberId: 1 }))).toEqual([1, 3, 6]);
    expect(ids(filterSanctions(list, "all", { source: "missed_clean" }))).toEqual([2]);
    expect(ids(filterSanctions(list, "open", { memberId: 2, source: "missed_clean" }))).toEqual([2]);
    expect(ids(filterSanctions(list, "open", { memberId: 2, source: "manual" }))).toEqual([]);
  });
  it("matches free text against reason, job, notes and member name, case-insensitively", () => {
    expect(ids(filterSanctions(list, "all", { q: "KITCHEN" }))).toEqual([1, 2, 3, 5, 6]); // default job is "Deep clean kitchen"
    expect(ids(filterSanctions(list, "all", { q: "cracked" }))).toEqual([4]);
    expect(ids(filterSanctions(list, "all", { q: "meister" }))).toEqual([2, 5]);
    expect(ids(filterSanctions(list, "all", { q: "  window " }))).toEqual([4]);
    expect(ids(filterSanctions(list, "all", { q: "" }))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("sortSanctions and splitForMember", () => {
  it("puts outstanding work first by due date, undated last, then history newest first", () => {
    const list = [
      s({ id: 1, status: "verified", issuedAt: "2026-10-01T00:00:00.000Z" }),
      s({ id: 2, status: "open", dueAt: "2026-10-25T00:00:00.000Z" }),
      s({ id: 3, status: "in_progress", dueAt: "2026-10-20T00:00:00.000Z" }),
      s({ id: 4, status: "open", dueAt: null }),
      s({ id: 5, status: "completed", issuedAt: "2026-10-05T00:00:00.000Z" }),
      s({ id: 6, status: "verified", issuedAt: "2026-10-09T00:00:00.000Z" }),
      s({ id: 7, status: "waived", issuedAt: "2026-10-12T00:00:00.000Z" }),
      s({ id: 8, status: "appealed", dueAt: "2026-10-20T00:00:00.000Z" }),
    ];
    expect(sortSanctions(list).map((x) => x.id)).toEqual([3, 8, 2, 4, 5, 6, 1, 7]);
    const parts = splitForMember(list);
    expect(parts.active.map((x) => x.id)).toEqual([3, 8, 2, 4]);
    expect(parts.awaiting.map((x) => x.id)).toEqual([5]);
    expect(parts.history.map((x) => x.id)).toEqual([6, 1, 7]);
  });
  it("does not mutate the input", () => {
    const list = [s({ id: 2, status: "verified" }), s({ id: 1, status: "open" })];
    sortSanctions(list);
    expect(list.map((x) => x.id)).toEqual([2, 1]);
  });
});

describe("allowedActions and nextStatus", () => {
  it("gives the owner start/complete/appeal only while the job is outstanding", () => {
    expect(allowedActions("open", { isOwner: true, isManager: false })).toEqual(["start", "complete", "appeal"]);
    expect(allowedActions("in_progress", { isOwner: true, isManager: false })).toEqual(["complete", "appeal"]);
    expect(allowedActions("completed", { isOwner: true, isManager: false })).toEqual([]);
    expect(allowedActions("appealed", { isOwner: true, isManager: false })).toEqual([]);
    expect(allowedActions("verified", { isOwner: true, isManager: false })).toEqual([]);
  });
  it("gives a manager verify/waive on live sanctions, reopen on anything not open, always edit/delete", () => {
    expect(allowedActions("open", { isOwner: false, isManager: true })).toEqual(["verify", "waive", "edit", "delete"]);
    expect(allowedActions("completed", { isOwner: false, isManager: true })).toEqual(["verify", "waive", "reopen", "edit", "delete"]);
    expect(allowedActions("appealed", { isOwner: false, isManager: true })).toEqual(["verify", "waive", "reopen", "edit", "delete"]);
    expect(allowedActions("verified", { isOwner: false, isManager: true })).toEqual(["reopen", "edit", "delete"]);
    expect(allowedActions("waived", { isOwner: false, isManager: true })).toEqual(["reopen", "edit", "delete"]);
  });
  it("a manager who owns the sanction gets both sets", () => {
    expect(allowedActions("open", { isOwner: true, isManager: true })).toEqual(["start", "complete", "appeal", "verify", "waive", "edit", "delete"]);
  });
  it("nobody gets anything without a role", () => {
    expect(allowedActions("open", { isOwner: false, isManager: false })).toEqual([]);
  });
  it("nextStatus follows the flow and rejects illegal moves", () => {
    expect(nextStatus("open", "start")).toBe("in_progress");
    expect(nextStatus("in_progress", "start")).toBeNull();
    expect(nextStatus("in_progress", "complete")).toBe("completed");
    expect(nextStatus("completed", "complete")).toBeNull();
    expect(nextStatus("open", "appeal")).toBe("appealed");
    expect(nextStatus("verified", "appeal")).toBeNull();
    expect(nextStatus("completed", "verify")).toBe("verified");
    expect(nextStatus("waived", "verify")).toBeNull();
    expect(nextStatus("appealed", "waive")).toBe("waived");
    expect(nextStatus("verified", "waive")).toBeNull();
    expect(nextStatus("waived", "reopen")).toBe("open");
    expect(nextStatus("open", "reopen")).toBeNull();
  });
});

describe("summarizeJobs", () => {
  it("groups by job description with done, outstanding and pending members", () => {
    const list = [
      s({ id: 1, jobDescription: "Deep clean kitchen", status: "verified", memberId: 1 }),
      s({ id: 2, jobDescription: "Deep clean kitchen ", status: "open", memberId: 2, memberName: "Martin Meister", dueAt: "2026-10-22T00:00:00.000Z" }),
      s({ id: 3, jobDescription: "Deep clean kitchen", status: "in_progress", memberId: 3, memberName: "Ana", dueAt: "2026-10-20T00:00:00.000Z" }),
      s({ id: 4, jobDescription: "Deep clean kitchen", status: "waived", memberId: 4 }),
      s({ id: 5, jobDescription: "Mop basement", status: "completed", memberId: 1 }),
      s({ id: 6, jobDescription: null, status: "open", memberId: 5, memberName: "Sam" }),
      s({ id: 7, jobDescription: "   ", status: "verified", memberId: 6 }),
    ];
    const summary = summarizeJobs(list);
    expect(summary.map((g) => g.job)).toEqual(["Deep clean kitchen", "Mop basement", NO_JOB_LABEL]);
    const kitchen = summary[0];
    expect(kitchen.total).toBe(4);
    expect(kitchen.done).toBe(1);
    expect(kitchen.outstanding).toBe(2);
    expect(kitchen.waived).toBe(1);
    expect(kitchen.pending.map((p) => p.memberName)).toEqual(["Ana", "Martin Meister"]);
    expect(summary[1]).toMatchObject({ total: 1, done: 1, outstanding: 0 });
    expect(summary[2]).toMatchObject({ total: 2, done: 1, outstanding: 1 });
  });
  it("returns an empty array for no sanctions", () => {
    expect(summarizeJobs([])).toEqual([]);
  });
});

describe("appendAppealNote and isSanctionTab", () => {
  it("appends a dated appeal line, keeping prior notes", () => {
    expect(appendAppealNote(null, " I was abroad ", "2026-10-18T14:00:00.000Z")).toBe("Appeal (2026-10-18): I was abroad");
    expect(appendAppealNote("Issued at standards", "Not me", "2026-10-18T14:00:00.000Z")).toBe("Issued at standards\n\nAppeal (2026-10-18): Not me");
  });
  it("recognizes tabs", () => {
    expect(isSanctionTab("open")).toBe(true);
    expect(isSanctionTab("to_verify")).toBe(true);
    expect(isSanctionTab("bogus")).toBe(false);
    expect(isSanctionTab(null)).toBe(false);
  });
});
