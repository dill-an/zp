import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/permissions";
import {
  canActOnTask,
  canCreateTaskForChair,
  canEditTask,
  checklistProgress,
  describeStatusChange,
  diffAssignees,
  dueLabel,
  formatDueCompact,
  isOverdue,
  nextOccurrenceDue,
  parseChecklistText,
  parseTags,
  rejectedAssignees,
  serializeTags,
  sortTasks,
  statusActions,
  type TaskLike,
} from "./tasks-logic";

// Sunday Oct 18 2026, 3pm New York (EDT, UTC-4).
const NOW = new Date("2026-10-18T19:00:00.000Z");

function task(overrides: Partial<TaskLike> & { id?: number } = {}): TaskLike & { id: number } {
  return { id: 0, status: "todo", dueAt: null, priority: "normal", createdAt: "2026-10-01T00:00:00.000Z", ...overrides };
}

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    firstName: "Test",
    lastName: "User",
    preferredName: "Test",
    username: "test.user",
    passwordHash: "",
    mustChangePassword: false,
    role: "member",
    status: "active",
    laborGroup: "cleans",
    pledgeClassId: null,
    email: null,
    phone: null,
    room: null,
    livesInHouse: true,
    major: null,
    gradYear: null,
    birthday: null,
    emergencyContact: null,
    dietaryNotes: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    chairSlugs: [],
    chairIds: [],
    permissions: [],
    ...overrides,
  };
}

describe("isOverdue", () => {
  it("is true for an open task whose due instant has passed", () => {
    expect(isOverdue(task({ dueAt: "2026-10-18T18:59:00.000Z" }), NOW)).toBe(true);
    expect(isOverdue(task({ status: "in_progress", dueAt: "2026-10-17T03:59:00.000Z" }), NOW)).toBe(true);
    expect(isOverdue(task({ status: "blocked", dueAt: "2026-10-17T03:59:00.000Z" }), NOW)).toBe(true);
  });
  it("is false when due later, when there is no due date, or when the task is closed", () => {
    expect(isOverdue(task({ dueAt: "2026-10-18T19:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(task({ dueAt: "2026-10-19T03:59:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(task({ dueAt: null }), NOW)).toBe(false);
    expect(isOverdue(task({ status: "done", dueAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(task({ status: "cancelled", dueAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
  });
  it("ignores unparseable due values", () => {
    expect(isOverdue(task({ dueAt: "not a date" }), NOW)).toBe(false);
  });
});

describe("sortTasks", () => {
  it("puts overdue first, then due ascending, then priority, then creation order, and leaves no-due last", () => {
    const items = [
      task({ id: 1, dueAt: null, priority: "urgent" }),
      task({ id: 2, dueAt: "2026-10-25T03:59:00.000Z" }),
      task({ id: 3, dueAt: "2026-10-20T03:59:00.000Z", priority: "low" }),
      task({ id: 4, dueAt: "2026-10-20T03:59:00.000Z", priority: "high" }),
      task({ id: 5, dueAt: "2026-10-10T03:59:00.000Z" }), // overdue
      task({ id: 6, dueAt: "2026-10-15T03:59:00.000Z", priority: "low" }), // overdue, later due
      task({ id: 7, dueAt: null, priority: "normal", createdAt: "2026-09-01T00:00:00.000Z" }),
      task({ id: 8, dueAt: null, priority: "normal", createdAt: "2026-09-02T00:00:00.000Z" }),
    ];
    const sorted = sortTasks(items, NOW).map((t) => t.id);
    expect(sorted).toEqual([5, 6, 4, 3, 2, 1, 7, 8]);
  });
  it("does not mutate the input", () => {
    const items = [task({ id: 2, dueAt: "2026-10-25T03:59:00.000Z" }), task({ id: 1, dueAt: "2026-10-20T03:59:00.000Z" })];
    sortTasks(items, NOW);
    expect(items.map((t) => t.id)).toEqual([2, 1]);
  });
  it("overdue done tasks are not treated as overdue", () => {
    const items = [task({ id: 1, status: "done", dueAt: "2026-10-01T00:00:00.000Z" }), task({ id: 2, dueAt: "2026-10-30T00:00:00.000Z" })];
    // Neither is overdue (done is closed), so plain due order applies: Oct 1 before Oct 30.
    expect(sortTasks(items, NOW).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("nextOccurrenceDue", () => {
  const completed = "2026-10-18T20:00:00.000Z";
  it("returns null for non-recurring tasks", () => {
    expect(nextOccurrenceDue("2026-10-19T03:59:00.000Z", completed, "none")).toBeNull();
  });
  it("adds 7, 14 and 30 days to the previous due date", () => {
    expect(nextOccurrenceDue("2026-10-19T03:59:00.000Z", completed, "weekly")).toBe("2026-10-26T03:59:00.000Z");
    expect(nextOccurrenceDue("2026-10-19T03:59:00.000Z", completed, "biweekly")).toBe("2026-11-02T04:59:00.000Z");
    expect(nextOccurrenceDue("2026-10-19T03:59:00.000Z", completed, "monthly")).toBe("2026-11-18T04:59:00.000Z");
  });
  it("keeps the house wall-clock time across the DST change", () => {
    // Oct 25 23:59 EDT -> Nov 1 23:59 EST (clocks fall back Nov 1 2026).
    expect(nextOccurrenceDue("2026-10-26T03:59:00.000Z", completed, "weekly")).toBe("2026-11-02T04:59:00.000Z");
  });
  it("uses the completion instant plus the interval when there was no due date", () => {
    expect(nextOccurrenceDue(null, completed, "weekly")).toBe("2026-10-25T20:00:00.000Z");
    expect(nextOccurrenceDue(null, completed, "monthly")).toBe("2026-11-17T21:00:00.000Z");
  });
  it("steps forward past the completion instant when the task was finished very late", () => {
    // Due Sep 20 23:59, finished Oct 18 at 4pm: Sep 27, Oct 4 and Oct 11 are behind us; Oct 18 23:59 is the first slot still ahead.
    expect(nextOccurrenceDue("2026-09-21T03:59:00.000Z", completed, "weekly")).toBe("2026-10-19T03:59:00.000Z");
    // Finished the morning of Oct 19: Oct 18's slot is gone too, so Oct 25.
    expect(nextOccurrenceDue("2026-09-21T03:59:00.000Z", "2026-10-19T12:00:00.000Z", "weekly")).toBe("2026-10-26T03:59:00.000Z");
  });
});

describe("checklistProgress", () => {
  it("counts done items and formats a label", () => {
    const p = checklistProgress([{ isDone: true }, { isDone: false }, { isDone: true }, { isDone: false }]);
    expect(p).toEqual({ done: 2, total: 4, label: "2/4", percent: 50, complete: false });
  });
  it("treats an empty checklist as zero, not complete", () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, label: "0/0", percent: 0, complete: false });
  });
  it("marks all-done as complete", () => {
    expect(checklistProgress([{ isDone: true }]).complete).toBe(true);
  });
});

describe("permissions", () => {
  const chairTask = { createdById: 50, chairId: 7 };
  const generalTask = { createdById: 50, chairId: null };
  it("assignees may act but not edit", () => {
    const u = user({ id: 9 });
    expect(canActOnTask(u, chairTask, [9, 10])).toBe(true);
    expect(canEditTask(u, chairTask)).toBe(false);
  });
  it("creator may act and edit", () => {
    const u = user({ id: 50 });
    expect(canActOnTask(u, chairTask, [])).toBe(true);
    expect(canEditTask(u, chairTask)).toBe(true);
  });
  it("chair holder manages that chair's tasks only", () => {
    const holder = user({ id: 3, chairIds: [7], chairSlugs: ["social_chair"], permissions: ["events.manage", "announcements.post"] });
    expect(canEditTask(holder, chairTask)).toBe(true);
    expect(canEditTask(holder, { createdById: 50, chairId: 8 })).toBe(false);
    expect(canEditTask(holder, generalTask)).toBe(false);
    expect(canActOnTask(holder, generalTask, [])).toBe(false);
  });
  it("tasks.manage_all and admins manage everything, including General tasks", () => {
    const vp = user({ id: 4, permissions: ["tasks.manage_all"] });
    expect(canEditTask(vp, generalTask)).toBe(true);
    expect(canEditTask(vp, chairTask)).toBe(true);
    const admin = user({ id: 5, role: "admin" });
    expect(canEditTask(admin, generalTask)).toBe(true);
  });
  it("strangers can do nothing and logged out users can do nothing", () => {
    expect(canActOnTask(user({ id: 99 }), chairTask, [1, 2])).toBe(false);
    expect(canActOnTask(null, chairTask, [1])).toBe(false);
    expect(canEditTask(undefined, chairTask)).toBe(false);
  });
  it("anyone may create a General task; chair tasks need a manager", () => {
    const plain = user({ id: 11 });
    expect(canCreateTaskForChair(plain, null)).toBe(true);
    expect(canCreateTaskForChair(plain, 7)).toBe(false);
    expect(canCreateTaskForChair(user({ id: 12, chairIds: [7] }), 7)).toBe(true);
    expect(canCreateTaskForChair(user({ id: 13, role: "admin" }), 7)).toBe(true);
    expect(canCreateTaskForChair(null, null)).toBe(false);
  });
});

describe("statusActions", () => {
  it("offers Done from every open status and only Reopen from closed ones", () => {
    for (const s of ["todo", "in_progress", "blocked"] as const) {
      expect(statusActions(s).map((a) => a.status)).toContain("done");
      expect(statusActions(s).map((a) => a.status)).not.toContain(s);
    }
    expect(statusActions("done")).toEqual([{ status: "todo", label: "Reopen", variant: "secondary" }]);
    expect(statusActions("cancelled").map((a) => a.status)).toEqual(["todo"]);
  });
});

describe("text parsing", () => {
  it("parses checklist lines, stripping bullets and boxes", () => {
    expect(parseChecklistText("- Pick theme\n* [ ] Set budget\n\n  [x] Book DJ  \n•Buy ice")).toEqual(["Pick theme", "Set budget", "Book DJ", "Buy ice"]);
    expect(parseChecklistText("")).toEqual([]);
    expect(parseChecklistText(undefined)).toEqual([]);
  });
  it("parses, normalizes and de-duplicates tags", () => {
    expect(parseTags(" Social, budget ,SOCIAL,, rush  week ")).toEqual(["social", "budget", "rush week"]);
    expect(serializeTags(parseTags("a, b"))).toBe("a, b");
    expect(serializeTags([])).toBeNull();
  });
});

describe("due formatting", () => {
  it("describes due dates relative to today in the house timezone", () => {
    // 23:59 New York on Oct 18 is 03:59Z on Oct 19: still "due today", not tomorrow.
    expect(dueLabel("2026-10-19T03:59:00.000Z", NOW)).toBe("due today");
    expect(dueLabel("2026-10-20T03:59:00.000Z", NOW)).toBe("due tomorrow");
    expect(dueLabel("2026-10-16T03:59:00.000Z", NOW)).toBe("3 days overdue");
    expect(dueLabel(null, NOW)).toBe("");
  });
  it("formats a compact due date, hiding the end-of-day time", () => {
    expect(formatDueCompact("2026-10-19T03:59:00.000Z", NOW)).toBe("Oct 18");
    expect(formatDueCompact("2026-10-20T18:30:00.000Z", NOW)).toBe("Oct 20, 2:30 PM");
    expect(formatDueCompact("2027-01-05T04:59:00.000Z", NOW)).toBe("Jan 4, 2027");
    expect(formatDueCompact(null, NOW)).toBe("");
  });
});

describe("activity helpers", () => {
  it("describes transitions", () => {
    expect(describeStatusChange("todo", "done")).toBe("Marked done");
    expect(describeStatusChange("done", "todo")).toBe("Reopened");
    expect(describeStatusChange("blocked", "in_progress")).toBe("Unblocked and started");
    expect(describeStatusChange("todo", "in_progress")).toBe("Started");
    expect(describeStatusChange("in_progress", "todo")).toBe("Moved from in progress to to-do");
  });
  it("diffs assignee lists", () => {
    expect(diffAssignees([1, 2, 3], [2, 3, 4])).toEqual({ added: [4], removed: [1] });
    expect(diffAssignees([], [])).toEqual({ added: [], removed: [] });
  });
});

describe("rejectedAssignees", () => {
  const found = [
    { id: 1, status: "active" },
    { id: 2, status: "inactive" },
    { id: 3, status: "alumni" },
    { id: 4, status: "new" },
  ];
  it("rejects inactive and alumni brothers who are not on the task yet", () => {
    expect(rejectedAssignees(found)).toEqual([2, 3]);
    expect(rejectedAssignees([])).toEqual([]);
  });
  it("keeps assignees already on the task even though they are no longer active", () => {
    // An officer editing only the description must not be forced to untick them first.
    expect(rejectedAssignees(found, [2, 3])).toEqual([]);
    expect(rejectedAssignees(found, [2])).toEqual([3]);
    expect(rejectedAssignees(found, [1, 4])).toEqual([2, 3]);
  });
});
