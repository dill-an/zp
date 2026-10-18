import { describe, expect, it } from "vitest";
import {
  auditHref,
  backupFilename,
  changedSettingKeys,
  completionPercent,
  deniedMessage,
  dueBucket,
  formToSettings,
  greeting,
  houseHour,
  houseSettingsSchema,
  inWeek,
  pageCount,
  parseAuditParams,
  settingsToForm,
  weekEnd,
  weekSummary,
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
