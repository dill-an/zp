import { describe, expect, it } from "vitest";
import {
  announcementExpired,
  announcementVisible,
  audienceApplies,
  bodyParagraphs,
  currentMonth,
  eventIsPast,
  eventTab,
  formatEventRange,
  houseDate,
  inMonth,
  maintenanceStatusesForTab,
  maintenanceTab,
  monthGrid,
  monthKey,
  monthTitle,
  parseMonthKey,
  priorityRank,
  relativeAge,
  rsvpCounts,
  shiftMonth,
  type AnnouncementViewer,
} from "./community-logic";

const brother: AnnouncementViewer = { role: "member", chairSlugs: [], status: "active", livesInHouse: true };
const liveOut: AnnouncementViewer = { role: "member", chairSlugs: [], status: "active", livesInHouse: false };
const newMember: AnnouncementViewer = { role: "member", chairSlugs: [], status: "new_member", livesInHouse: true };
const chairHolder: AnnouncementViewer = { role: "member", chairSlugs: ["social_chair"], status: "active", livesInHouse: false };
const officerRole: AnnouncementViewer = { role: "officer", chairSlugs: [], status: "active", livesInHouse: false };
const admin: AnnouncementViewer = { role: "admin", chairSlugs: [], status: "active", livesInHouse: false };

// 2026-10-18 at 10:00 in New York (EDT, UTC-4)
const NOW = new Date("2026-10-18T14:00:00.000Z");

describe("monthGrid", () => {
  it("covers October 2026 in five Sunday-first weeks with padding days", () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toBe("2026-09-27");
    expect(grid[0][4]).toBe("2026-10-01");
    expect(grid[4][6]).toBe("2026-10-31");
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("returns exactly four weeks for February 2026 (starts on a Sunday)", () => {
    const grid = monthGrid(2026, 2);
    expect(grid).toHaveLength(4);
    expect(grid[0][0]).toBe("2026-02-01");
    expect(grid[3][6]).toBe("2026-02-28");
  });

  it("pads into the next month and handles leap years", () => {
    const grid = monthGrid(2028, 2);
    const flat = grid.flat();
    expect(flat).toContain("2028-02-29");
    expect(flat.at(-1)).toBe("2028-03-04");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid.flat().filter((d) => inMonth(d, 2028, 2))).toHaveLength(29);
  });

  it("produces consecutive dates", () => {
    const flat = monthGrid(2026, 12).flat();
    for (let i = 1; i < flat.length; i++) expect(flat[i] > flat[i - 1]).toBe(true);
    expect(flat[0]).toBe("2026-11-29");
    expect(flat.at(-1)).toBe("2027-01-02");
  });
});

describe("month helpers", () => {
  it("formats and parses month keys", () => {
    expect(monthKey(2026, 3)).toBe("2026-03");
    expect(parseMonthKey("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthKey(["2026-01", "x"])).toEqual({ year: 2026, month: 1 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("nope")).toBeNull();
    expect(parseMonthKey(undefined)).toBeNull();
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 6, -18)).toEqual({ year: 2024, month: 12 });
  });

  it("titles months and finds the current house month", () => {
    expect(monthTitle(2026, 10)).toBe("October 2026");
    expect(currentMonth(NOW)).toEqual({ year: 2026, month: 10 });
    // 11pm New York on Oct 31 is already Nov 1 in UTC but still October in the house.
    expect(currentMonth(new Date("2026-11-01T03:30:00.000Z"))).toEqual({ year: 2026, month: 10 });
  });

  it("maps instants to house dates", () => {
    expect(houseDate("2026-11-01T03:30:00.000Z")).toBe("2026-10-31");
    expect(houseDate("2026-10-18T23:00:00.000Z")).toBe("2026-10-18");
  });
});

describe("events", () => {
  it("uses the end time when present", () => {
    expect(eventIsPast({ startsAt: "2026-10-18T12:00:00.000Z", endsAt: "2026-10-18T16:00:00.000Z" }, NOW)).toBe(false);
    expect(eventIsPast({ startsAt: "2026-10-18T12:00:00.000Z", endsAt: null }, NOW)).toBe(true);
    expect(eventTab({ startsAt: "2026-10-19T12:00:00.000Z", endsAt: null }, NOW)).toBe("upcoming");
    expect(eventTab({ startsAt: "2026-10-01T12:00:00.000Z", endsAt: "2026-10-01T13:00:00.000Z" }, NOW)).toBe("past");
  });

  it("formats time ranges compactly on the same day", () => {
    expect(formatEventRange("2026-11-20T23:00:00.000Z", null)).toBe("Fri, Nov 20 at 6:00 PM");
    expect(formatEventRange("2026-11-20T23:00:00.000Z", "2026-11-21T03:00:00.000Z")).toBe("Fri, Nov 20 at 6:00 PM to 10:00 PM");
    expect(formatEventRange("2026-11-20T23:00:00.000Z", "2026-11-21T06:00:00.000Z")).toBe("Fri, Nov 20 at 6:00 PM to Sat, Nov 21 at 1:00 AM");
  });

  it("counts rsvps and guests of those going", () => {
    expect(
      rsvpCounts([
        { status: "going", guests: 2 },
        { status: "going", guests: 0 },
        { status: "maybe", guests: 5 },
        { status: "not_going", guests: 0 },
      ]),
    ).toEqual({ going: 2, maybe: 1, notGoing: 1, guests: 2 });
    expect(rsvpCounts([])).toEqual({ going: 0, maybe: 0, notGoing: 0, guests: 0 });
  });
});

describe("announcementVisible", () => {
  it("shows 'all' to everyone", () => {
    expect(announcementVisible({ audience: "all", expiresAt: null }, brother, NOW)).toBe(true);
    expect(announcementVisible({ audience: "all", expiresAt: null }, newMember, NOW)).toBe(true);
  });

  it("limits 'officers' to admins, officer-role members and chair holders", () => {
    const a = { audience: "officers" as const, expiresAt: null };
    expect(announcementVisible(a, brother, NOW)).toBe(false);
    expect(announcementVisible(a, newMember, NOW)).toBe(false);
    expect(announcementVisible(a, chairHolder, NOW)).toBe(true);
    expect(announcementVisible(a, officerRole, NOW)).toBe(true);
    expect(announcementVisible(a, admin, NOW)).toBe(true);
  });

  it("limits 'new_members' by status and 'live_in' by residence", () => {
    expect(audienceApplies("new_members", newMember)).toBe(true);
    expect(audienceApplies("new_members", brother)).toBe(false);
    expect(audienceApplies("new_members", admin)).toBe(false);
    expect(audienceApplies("live_in", brother)).toBe(true);
    expect(audienceApplies("live_in", liveOut)).toBe(false);
  });

  it("hides expired announcements but keeps them through the expiry day", () => {
    expect(announcementExpired({ expiresAt: "2026-10-17" }, NOW)).toBe(true);
    expect(announcementExpired({ expiresAt: "2026-10-18" }, NOW)).toBe(false);
    expect(announcementExpired({ expiresAt: "2026-10-19" }, NOW)).toBe(false);
    expect(announcementExpired({ expiresAt: null }, NOW)).toBe(false);
    expect(announcementExpired({ expiresAt: "2026-10-17T23:00:00.000Z" }, NOW)).toBe(true);
    expect(announcementVisible({ audience: "all", expiresAt: "2026-10-01" }, admin, NOW)).toBe(false);
  });

  it("splits bodies into paragraphs and lines", () => {
    expect(bodyParagraphs("Line one\nLine two\n\nSecond paragraph\r\n\r\n\n  \nThird")).toEqual([
      ["Line one", "Line two"],
      ["Second paragraph"],
      ["Third"],
    ]);
    expect(bodyParagraphs("")).toEqual([]);
  });
});

describe("maintenance", () => {
  it("groups wont_fix under the resolved tab", () => {
    expect(maintenanceTab("open")).toBe("open");
    expect(maintenanceTab("in_progress")).toBe("in_progress");
    expect(maintenanceTab("resolved")).toBe("resolved");
    expect(maintenanceTab("wont_fix")).toBe("resolved");
    expect(maintenanceStatusesForTab("resolved")).toEqual(["resolved", "wont_fix"]);
    expect(maintenanceStatusesForTab("open")).toEqual(["open"]);
  });

  it("ranks priorities", () => {
    expect(priorityRank("urgent")).toBeGreaterThan(priorityRank("high"));
    expect(priorityRank("high")).toBeGreaterThan(priorityRank("normal"));
    expect(priorityRank("normal")).toBeGreaterThan(priorityRank("low"));
  });
});

describe("relativeAge", () => {
  it("describes recent instants by elapsed time", () => {
    expect(relativeAge("2026-10-18T13:59:50.000Z", NOW)).toBe("just now");
    expect(relativeAge("2026-10-18T13:55:00.000Z", NOW)).toBe("5 minutes ago");
    expect(relativeAge("2026-10-18T13:59:00.000Z", NOW)).toBe("1 minute ago");
    expect(relativeAge("2026-10-18T11:00:00.000Z", NOW)).toBe("3 hours ago");
    expect(relativeAge("2026-10-18T13:00:00.000Z", NOW)).toBe("1 hour ago");
  });

  it("uses house calendar days from a day onwards", () => {
    // Oct 15 at 8pm ET is 2 days and 18 hours before NOW but three calendar days back.
    expect(relativeAge("2026-10-16T00:00:00.000Z", NOW)).toBe("3 days ago");
    expect(relativeAge("2026-10-17T10:00:00.000Z", NOW)).toBe("1 day ago");
    expect(relativeAge("2026-10-04T14:00:00.000Z", NOW)).toBe("2 weeks ago");
    expect(relativeAge("2026-07-18T14:00:00.000Z", NOW)).toBe("3 months ago");
    expect(relativeAge("2024-10-18T14:00:00.000Z", NOW)).toBe("2 years ago");
  });

  it("handles the future and bad input", () => {
    expect(relativeAge("2026-10-20T14:00:00.000Z", NOW)).toBe("in 2 days");
    expect(relativeAge("2026-10-18T16:00:00.000Z", NOW)).toBe("in 2 hours");
    expect(relativeAge(null, NOW)).toBe("");
    expect(relativeAge("garbage", NOW)).toBe("");
  });
});
