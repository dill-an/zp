import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  compareDates,
  dayOfWeek,
  dueDescription,
  formatDate,
  instantToDate,
  isoToLocalInput,
  localInputToISO,
  todayISO,
  tzOffsetMinutes,
  weekStartFor,
} from "./dates";

describe("calendar dates", () => {
  it("finds the Sunday that starts a week", () => {
    expect(weekStartFor("2026-10-18")).toBe("2026-10-18"); // Sunday
    expect(weekStartFor("2026-10-21")).toBe("2026-10-18"); // Wednesday
    expect(weekStartFor("2026-10-24")).toBe("2026-10-18"); // Saturday
    expect(weekStartFor("2026-10-25")).toBe("2026-10-25");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-10-18", 7)).toBe("2026-10-25");
    expect(addDaysISO("2026-10-29", 3)).toBe("2026-11-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("knows weekdays and ordering", () => {
    expect(dayOfWeek("2026-10-18")).toBe(0);
    expect(dayOfWeek("2026-10-19")).toBe(1);
    expect(compareDates("2026-10-18", "2026-10-19")).toBeLessThan(0);
    expect(compareDates("2026-10-18", "2026-10-18")).toBe(0);
  });

  it("formats instants on the house calendar day", () => {
    expect(formatDate("2026-10-19T03:59:00.000Z")).toBe("Oct 18");
    expect(formatDate("2026-10-18", { year: true, weekday: true })).toBe("Sun, Oct 18, 2026");
    expect(instantToDate("2026-12-14T04:30:00.000Z")).toBe("2026-12-13");
  });

  it("derives today in the house timezone", () => {
    // 03:30 UTC on Oct 19 is still Oct 18 in New York (EDT, UTC-4).
    expect(todayISO(new Date("2026-10-19T03:30:00Z"))).toBe("2026-10-18");
    expect(todayISO(new Date("2026-10-19T04:30:00Z"))).toBe("2026-10-19");
  });
});

describe("timezone conversion", () => {
  it("reports the New York offset for daylight and standard time", () => {
    expect(tzOffsetMinutes(new Date("2026-10-18T12:00:00Z"))).toBe(-240);
    expect(tzOffsetMinutes(new Date("2026-12-18T12:00:00Z"))).toBe(-300);
  });

  it("round-trips datetime-local values", () => {
    expect(localInputToISO("2026-10-18T19:00")).toBe("2026-10-18T23:00:00.000Z");
    expect(localInputToISO("2026-12-13T19:00")).toBe("2026-12-14T00:00:00.000Z");
    expect(isoToLocalInput("2026-10-18T23:00:00.000Z")).toBe("2026-10-18T19:00");
    expect(isoToLocalInput("2026-12-14T00:00:00.000Z")).toBe("2026-12-13T19:00");
    expect(localInputToISO("")).toBeNull();
  });
});

describe("due descriptions", () => {
  const now = new Date("2026-10-18T16:00:00Z");
  it("describes relative due dates", () => {
    expect(dueDescription("2026-10-18", now)).toBe("due today");
    expect(dueDescription("2026-10-19", now)).toBe("due tomorrow");
    expect(dueDescription("2026-10-21", now)).toBe("due in 3 days");
    expect(dueDescription("2026-10-17", now)).toBe("1 day overdue");
    expect(dueDescription("2026-10-10", now)).toBe("8 days overdue");
    // 03:00Z on Oct 20 is still Oct 19 in New York.
    expect(dueDescription("2026-10-20T03:00:00.000Z", now)).toBe("due tomorrow");
    expect(dueDescription("2026-10-19T03:59:00.000Z", now)).toBe("due today");
    expect(dueDescription(null, now)).toBe("");
  });
});
