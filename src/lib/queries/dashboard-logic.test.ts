import { describe, expect, it } from "vitest";
import {
  auditHref,
  backupFilename,
  buildWaitingItems,
  changedSettingKeys,
  completionPercent,
  deniedMessage,
  dueBucket,
  formToSettings,
  greeting,
  houseHour,
  houseSettingsSchema,
  inWeek,
  jobDueLabel,
  jobDueParts,
  laborWeekNotice,
  missingContactFields,
  nextWeekMessage,
  pageCount,
  parseAuditParams,
  settingsToForm,
  unassignedOnBoards,
  weekEnd,
  weekSummary,
  withinLastDays,
  type WaitingInput,
} from "./dashboard-logic";

describe("greeting", () => {
  it("picks a greeting by hour", () => {
    expect(greeting(2)).toBe("Good evening");
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(13)).toBe("Good afternoon");
    expect(greeting(19)).toBe("Good evening");
  });

  it("reads the hour in the house timezone", () => {
    // 2026-10-18T21:10Z is 17:10 in New York (EDT).
    expect(houseHour(new Date("2026-10-18T21:10:00Z"))).toBe(17);
    expect(houseHour(new Date("2026-10-19T03:30:00Z"))).toBe(23);
  });
});

describe("week helpers", () => {
  it("ends the week on Saturday", () => {
    expect(weekEnd("2026-10-18")).toBe("2026-10-24");
  });

  it("checks dates and instants against the week", () => {
    expect(inWeek("2026-10-18", "2026-10-18")).toBe(true);
    expect(inWeek("2026-10-24", "2026-10-18")).toBe(true);
    expect(inWeek("2026-10-25", "2026-10-18")).toBe(false);
    expect(inWeek("2026-10-17", "2026-10-18")).toBe(false);
    // Saturday 23:00 New York is Sunday 03:00 UTC; it still belongs to the week.
    expect(inWeek("2026-10-25T03:00:00.000Z", "2026-10-18")).toBe(true);
    expect(inWeek(null, "2026-10-18")).toBe(false);
  });

  it("buckets due instants", () => {
    const now = new Date("2026-10-18T16:00:00Z");
    expect(dueBucket(null, "2026-10-18", now)).toBe("none");
    expect(dueBucket("2026-10-17T16:00:00Z", "2026-10-18", now)).toBe("overdue");
    expect(dueBucket("2026-10-21T16:00:00Z", "2026-10-18", now)).toBe("this_week");
    expect(dueBucket("2026-11-02T16:00:00Z", "2026-10-18", now)).toBe("later");
  });

  it("rounds completion", () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(3, 3)).toBe(100);
  });
});

describe("weekSummary", () => {
  it("counts jobs, tasks due this week, duties and meetings", () => {
    const s = weekSummary({
      jobs: [{ state: "done" }, { state: "upcoming" }, { state: "verified" }],
      tasks: [{ bucket: "overdue" }, { bucket: "this_week" }, { bucket: "later" }, { bucket: "none" }],
      duties: [{ done: false }],
      meetings: [{ attended: true }, { attended: false }],
    });
    expect(s.total).toBe(3 + 2 + 1 + 2);
    expect(s.done).toBe(2 + 1);
    expect(s.label).toBe("8 things this week, 3 done");
  });

  it("uses the singular for one thing", () => {
    expect(weekSummary({ jobs: [{ state: "upcoming" }], tasks: [], duties: [], meetings: [] }).label).toBe("1 thing this week, 0 done");
  });
});

describe("deniedMessage", () => {
  it("names known permissions and hides unknown values", () => {
    expect(deniedMessage(undefined)).toBeNull();
    expect(deniedMessage("audit.view")).toBe("You do not have access to audit.view.");
    expect(deniedMessage("<script>")).toBe("You do not have access to that page.");
    expect(deniedMessage(["dues.manage", "x"])).toBe("You do not have access to dues.manage.");
  });
});

describe("audit params", () => {
  it("parses filters and the page", () => {
    expect(parseAuditParams({})).toEqual({ actorId: null, entity: "", q: "", page: 1 });
    expect(parseAuditParams({ actor: "7", entity: "sanction", q: " fine ", page: "3" })).toEqual({ actorId: 7, entity: "sanction", q: "fine", page: 3 });
    expect(parseAuditParams({ actor: "bob", page: "-2" }).actorId).toBeNull();
    expect(parseAuditParams({ page: "abc" }).page).toBe(1);
  });

  it("builds page links that keep the filters", () => {
    const p = parseAuditParams({ actor: "7", q: "venmo" });
    expect(auditHref(p)).toBe("/settings/audit?actor=7&q=venmo");
    expect(auditHref(p, 2)).toBe("/settings/audit?actor=7&q=venmo&page=2");
    expect(auditHref(parseAuditParams({}))).toBe("/settings/audit");
  });

  it("counts pages", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(7, 3)).toBe(3);
  });
});

describe("house settings", () => {
  const stored = {
    org_name: "Zeta Psi",
    chapter_name: "ZP House",
    semester_label: "Fall 2026",
    labor_tracking_start: "2026-10-18",
    venmo_handle: "zp-treasurer",
    house_meeting_day: "0",
    house_meeting_time: "19:00",
    missed_clean_fine_cents: "2500",
    missed_meeting_fine_cents: "1000",
  };

  it("maps stored values to the form and back", () => {
    const form = settingsToForm(stored);
    expect(form.missedCleanFine).toBe("25.00");
    expect(form.missedMeetingFine).toBe("10.00");
    expect(form.houseMeetingDay).toBe("0");
    const parsed = houseSettingsSchema.safeParse(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(formToSettings(parsed.data)).toEqual(stored);
  });

  it("strips a leading @ from the Venmo handle and converts dollars to cents", () => {
    const parsed = houseSettingsSchema.parse({ ...settingsToForm(stored), venmoHandle: "@zp-house", missedCleanFine: "$12.50", missedMeetingFine: "0" });
    const next = formToSettings(parsed);
    expect(next.venmo_handle).toBe("zp-house");
    expect(next.missed_clean_fine_cents).toBe("1250");
    expect(next.missed_meeting_fine_cents).toBe("0");
  });

  it("rejects bad dates, times and amounts", () => {
    const base = settingsToForm(stored);
    expect(houseSettingsSchema.safeParse({ ...base, laborTrackingStart: "2026-02-30" }).success).toBe(false);
    expect(houseSettingsSchema.safeParse({ ...base, houseMeetingTime: "7pm" }).success).toBe(false);
    expect(houseSettingsSchema.safeParse({ ...base, missedCleanFine: "-5" }).success).toBe(false);
    expect(houseSettingsSchema.safeParse({ ...base, houseMeetingDay: "9" }).success).toBe(false);
    expect(houseSettingsSchema.safeParse({ ...base, venmoHandle: undefined }).success).toBe(true);
  });

  it("lists changed keys", () => {
    expect(changedSettingKeys(stored, { ...stored })).toEqual([]);
    expect(changedSettingKeys(stored, { ...stored, venmo_handle: "other", semester_label: "Spring 2027" })).toEqual(["semester_label", "venmo_handle"]);
    expect(changedSettingKeys({}, { venmo_handle: "" })).toEqual([]);
  });

  it("names the backup file by date", () => {
    expect(backupFilename("2026-10-18")).toBe("zp-house-2026-10-18.sqlite");
  });
});

describe("job due labels", () => {
  const now = new Date("2026-10-19T16:00:00Z");

  it("separates the relative part with a space", () => {
    expect(jobDueLabel("2026-10-21", true, now)).toBe("due Wed, Oct 21 (due in 2 days)");
    expect(jobDueLabel("2026-10-19", true, now)).toBe("due Mon, Oct 19 (due today)");
    expect(jobDueLabel("2026-10-17", true, now)).toBe("due Sat, Oct 17 (2 days overdue)");
    expect(jobDueLabel("2026-10-21", false, now)).toBe("due Wed, Oct 21");
    expect(jobDueParts("2026-10-21", false, now)).toEqual({ base: "due Wed, Oct 21", relative: null });
  });
});

describe("week status wording", () => {
  it("only says 'no jobs for you' when a published week exists", () => {
    expect(nextWeekMessage({ exists: true, isPublished: true }, 0)).toBe("No jobs for you next week.");
    expect(nextWeekMessage({ exists: true, isPublished: false }, 0)).toBe("Nothing posted for next week yet.");
    expect(nextWeekMessage({ exists: false, isPublished: false }, 0)).toBe("Nothing posted for next week yet.");
    expect(nextWeekMessage({ exists: true, isPublished: true }, 2)).toBeNull();
  });

  it("tells officers about a missing or draft week", () => {
    expect(laborWeekNotice({ exists: false, isPublished: false }, "2026-10-18")).toEqual({ text: "No week posted yet", href: "/labor" });
    expect(laborWeekNotice({ exists: true, isPublished: false }, "2026-10-18")).toEqual({ text: "Week of Oct 18 is a draft, publish it", href: "/labor?manage=1" });
    expect(laborWeekNotice({ exists: true, isPublished: true }, "2026-10-18")).toBeNull();
  });
});

describe("missingContactFields", () => {
  it("reports blank phone and email", () => {
    expect(missingContactFields({ phone: null, email: null })).toEqual(["phone", "email"]);
    expect(missingContactFields({ phone: "  ", email: "gio@mit.edu" })).toEqual(["phone"]);
    expect(missingContactFields({ phone: "617-555-0100", email: "" })).toEqual(["email"]);
    expect(missingContactFields({ phone: "617-555-0100", email: "gio@mit.edu" })).toEqual([]);
  });
});

describe("unassignedOnBoards", () => {
  const tasks = [
    { id: 1, chairId: 3, assignees: [] },
    { id: 2, chairId: 3, assignees: [{ id: 9 }] },
    { id: 3, chairId: 4, assignees: [] },
    { id: 4, chairId: null, assignees: [] },
  ];

  it("keeps open unassigned tasks on the chairs held", () => {
    expect(unassignedOnBoards(tasks, [3]).map((t) => t.id)).toEqual([1]);
    expect(unassignedOnBoards(tasks, [3, 4]).map((t) => t.id)).toEqual([1, 3]);
    expect(unassignedOnBoards(tasks, [])).toEqual([]);
    expect(unassignedOnBoards(tasks, [7])).toEqual([]);
  });
});

describe("waiting on you", () => {
  const now = new Date("2026-10-19T16:00:00Z");
  const recent = "2026-10-17T12:00:00.000Z";
  const stale = "2026-10-01T12:00:00.000Z";

  it("checks the seven day window", () => {
    expect(withinLastDays(recent, now)).toBe(true);
    expect(withinLastDays(stale, now)).toBe(false);
    expect(withinLastDays("2026-10-12T16:00:00.000Z", now)).toBe(true);
    expect(withinLastDays("2026-10-12T15:59:59.000Z", now)).toBe(false);
    expect(withinLastDays("2026-10-20T00:00:00.000Z", now)).toBe(false);
    expect(withinLastDays(null, now)).toBe(false);
    expect(withinLastDays("garbage", now)).toBe(false);
  });

  const base: WaitingInput = { memberId: 22, inLaborPool: true, swaps: [], excuses: [], sanctions: [], tasks: [], duties: [] };
  const swap = (over: Partial<WaitingInput["swaps"][number]>): WaitingInput["swaps"][number] => ({
    id: 1,
    status: "pending",
    requestedById: 18,
    targetMemberId: 22,
    resolvedAt: null,
    createdAt: recent,
    jobName: "Upstairs Commons",
    weekStart: "2026-10-18",
    requesterName: "Martin Meister",
    jobOpen: true,
    ...over,
  });

  it("lists swaps asked of me and open swaps I could claim, linking to Swaps", () => {
    const items = buildWaitingItems(
      {
        ...base,
        swaps: [
          swap({ id: 1 }),
          swap({ id: 2, targetMemberId: null, requesterName: "Dylan Nguyen" }),
          swap({ id: 3, targetMemberId: 13 }),
          swap({ id: 4, requestedById: 22, targetMemberId: null }),
          swap({ id: 5, status: "declined", resolvedAt: recent }),
          swap({ id: 6, jobOpen: false }),
        ],
      },
      now,
    );
    expect(items.map((i) => [i.kind, i.key])).toEqual([
      ["swap_for_me", "swap-1"],
      ["swap_open", "swap-2"],
    ]);
    expect(items[0].title).toBe("Martin Meister asked you to take Upstairs Commons");
    expect(items[0].href).toBe("/labor/swaps");
    expect(items[1].title).toBe("Dylan Nguyen needs someone to take Upstairs Commons");
    expect(items[1].detail).toContain("week of Oct 18");
  });

  it("hides open swaps from brothers outside the labor pool", () => {
    const items = buildWaitingItems({ ...base, inLaborPool: false, swaps: [swap({ id: 2, targetMemberId: null })] }, now);
    expect(items).toEqual([]);
  });

  it("reports my decided swap and excuse requests from the last week, linking to My jobs", () => {
    const items = buildWaitingItems(
      {
        ...base,
        swaps: [
          swap({ id: 7, requestedById: 22, targetMemberId: 18, status: "approved", resolvedAt: recent }),
          swap({ id: 8, requestedById: 22, targetMemberId: 18, status: "declined", resolvedAt: stale }),
          swap({ id: 9, requestedById: 22, targetMemberId: 18, status: "accepted", resolvedAt: null }),
        ],
        excuses: [
          { id: 1, status: "denied", reviewedAt: recent, jobName: "Kitchen", weekStart: "2026-10-11" },
          { id: 2, status: "approved", reviewedAt: stale, jobName: "Kitchen", weekStart: "2026-10-04" },
          { id: 3, status: "pending", reviewedAt: null, jobName: "Kitchen", weekStart: "2026-10-18" },
        ],
      },
      now,
    );
    expect(items.map((i) => i.key)).toEqual(["swap-decided-7", "excuse-1"]);
    expect(items[0].title).toBe("Your swap request for Upstairs Commons was approved");
    expect(items[0].tone).toBe("success");
    expect(items[0].href).toBe("/labor/me");
    expect(items[1].title).toBe("Your excuse for Kitchen was denied");
    expect(items[1].tone).toBe("danger");
  });

  it("includes recent sanctions, recently assigned open tasks and duties this week, in action-first order", () => {
    const items = buildWaitingItems(
      {
        ...base,
        swaps: [swap({ id: 1 })],
        sanctions: [
          { id: 4, reason: "Missed clean", status: "open", issuedAt: recent, dueAt: "2026-10-26T23:00:00.000Z" },
          { id: 5, reason: "Old one", status: "open", issuedAt: stale, dueAt: null },
        ],
        tasks: [
          { id: 10, title: "Order paper towels", assignedAt: recent, dueAt: null },
          { id: 11, title: "Ancient", assignedAt: stale, dueAt: null },
        ],
        duties: [{ id: 6, eventId: 2, eventTitle: "Mixer", duty: "sober_monitor", label: null, startsAt: "2026-10-24T01:00:00.000Z" }],
      },
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(["swap_for_me", "duty", "task", "sanction"]);
    expect(items[1].title).toBe("Sober monitor at Mixer");
    expect(items[1].href).toBe("/events/2");
    expect(items[2].title).toBe("New task: Order paper towels");
    expect(items[2].href).toBe("/tasks/10");
    expect(items[2].detail).toContain("no due date");
    expect(items[3].title).toBe("Sanction issued: Missed clean");
    expect(items[3].href).toBe("/sanctions/4");
    expect(items[3].tone).toBe("danger");
  });

  it("is empty when nothing is going on", () => {
    expect(buildWaitingItems(base, now)).toEqual([]);
  });
});
