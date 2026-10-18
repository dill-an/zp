import { describe, expect, it } from "vitest";
import {
  absenteesForFines,
  attendanceRate,
  attendanceSummary,
  buildAttendanceMatrix,
  defaultAttendanceStatus,
  fineDescription,
  groupByClass,
  MAX_SERIES_LENGTH,
  meetingDateOnly,
  mostAbsences,
  splitParagraphs,
  weeklySeries,
  type MemberLite,
} from "./meetings-logic";

const psi = { id: 1, name: "Psi", sortOrder: 1 };
const omega = { id: 2, name: "Omega", sortOrder: 2 };

function member(id: number, first: string, last: string, pledgeClass: MemberLite["pledgeClass"]): MemberLite {
  return { id, firstName: first, lastName: last, preferredName: first, status: "active", pledgeClass };
}

describe("attendanceSummary", () => {
  it("counts each status and the total", () => {
    const s = attendanceSummary([
      { status: "present" },
      { status: "present" },
      { status: "absent" },
      { status: "excused" },
      { status: "late" },
    ]);
    expect(s).toEqual({ present: 2, absent: 1, excused: 1, late: 1, total: 5 });
  });

  it("is all zeros for no rows", () => {
    expect(attendanceSummary([])).toEqual({ present: 0, absent: 0, excused: 0, late: 0, total: 0 });
  });
});

describe("attendanceRate", () => {
  it("treats late as attended and ignores excused", () => {
    expect(attendanceRate({ present: 3, late: 1, absent: 1 })).toBe(80);
    expect(attendanceRate({ present: 2, late: 0, absent: 0 })).toBe(100);
    expect(attendanceRate({ present: 0, late: 0, absent: 2 })).toBe(0);
  });

  it("is 100 when nothing counts", () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0 })).toBe(100);
  });

  it("rounds to a whole percent", () => {
    expect(attendanceRate({ present: 2, late: 0, absent: 1 })).toBe(67);
  });
});

describe("weeklySeries", () => {
  it("lists every Sunday from the first Sunday on or after the start", () => {
    expect(weeklySeries("2026-10-14", "2026-11-08", 0)).toEqual(["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]);
  });

  it("includes the first date when it already falls on the weekday", () => {
    expect(weeklySeries("2026-10-18", "2026-10-25", 0)).toEqual(["2026-10-18", "2026-10-25"]);
  });

  it("handles other weekdays and month boundaries", () => {
    expect(weeklySeries("2026-10-29", "2026-11-12", 2)).toEqual(["2026-11-03", "2026-11-10"]);
  });

  it("returns nothing when the range is empty or inputs are invalid", () => {
    expect(weeklySeries("2026-10-25", "2026-10-18", 0)).toEqual([]);
    expect(weeklySeries("2026-10-19", "2026-10-24", 0)).toEqual([]);
    expect(weeklySeries("bad", "2026-10-24", 0)).toEqual([]);
    expect(weeklySeries("2026-10-19", "2026-10-24", 7)).toEqual([]);
  });

  it("caps very long ranges", () => {
    expect(weeklySeries("2020-01-01", "2030-01-01", 0)).toHaveLength(MAX_SERIES_LENGTH);
  });
});

describe("fineDescription", () => {
  it("uses the house-timezone calendar date", () => {
    // 2026-10-11 19:00 EDT = 23:00Z
    expect(fineDescription("House Meeting", "2026-10-11T23:00:00.000Z")).toBe("Missed House Meeting (Oct 11, 2026)");
    // 2026-10-11 21:30 EDT = 01:30Z on the 12th UTC, still Oct 11 in New York.
    expect(meetingDateOnly("2026-10-12T01:30:00.000Z")).toBe("2026-10-11");
  });
});

describe("absenteesForFines", () => {
  const rows = [
    { memberId: 1, status: "absent" as const },
    { memberId: 2, status: "present" as const },
    { memberId: 3, status: "absent" as const },
    { memberId: 4, status: "excused" as const },
    { memberId: 5, status: "late" as const },
    { memberId: 3, status: "absent" as const },
  ];
  const desc = "Missed House Meeting (Oct 11, 2026)";

  it("returns absent members only", () => {
    expect(absenteesForFines(rows, [], desc)).toEqual([1, 3]);
  });

  it("skips members already fined for this meeting but not for other meetings", () => {
    const charges = [
      { memberId: 1, description: desc },
      { memberId: 3, description: "Missed House Meeting (Oct 4, 2026)" },
    ];
    expect(absenteesForFines(rows, charges, desc)).toEqual([3]);
  });
});

describe("defaultAttendanceStatus", () => {
  it("prefers the existing record, then an approved excuse, then absent", () => {
    expect(defaultAttendanceStatus("present", true)).toBe("present");
    expect(defaultAttendanceStatus(null, true)).toBe("excused");
    expect(defaultAttendanceStatus(undefined, false)).toBe("absent");
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and drops empties", () => {
    expect(splitParagraphs("First para\nsame para\n\n\nSecond para \n\n")).toEqual(["First para\nsame para", "Second para"]);
    expect(splitParagraphs(null)).toEqual([]);
  });
});

describe("groupByClass", () => {
  it("orders groups oldest class first, unassigned last, and members by last name", () => {
    const list = [
      member(1, "Zed", "Young", omega),
      member(2, "Amy", "Baker", null),
      member(3, "Bob", "Adams", omega),
      member(4, "Cal", "Smith", psi),
    ];
    const groups = groupByClass(list, (m) => m);
    expect(groups.map((g) => g.label)).toEqual(["Psi", "Omega", "No pledge class"]);
    expect(groups[1].items.map((m) => m.id)).toEqual([3, 1]);
    expect(groups[2].classId).toBeNull();
  });
});

describe("buildAttendanceMatrix", () => {
  const members = [member(1, "Martin", "Meister", omega), member(2, "Marcos", "Arroyo", psi), member(3, "Gio", "Mandwee", omega)];
  const meetings = [
    { id: 20, title: "House Meeting", kind: "house" as const, scheduledAt: "2026-09-20T23:00:00.000Z" },
    { id: 10, title: "House Meeting", kind: "house" as const, scheduledAt: "2026-09-13T23:00:00.000Z" },
  ];
  const rows = [
    { meetingId: 10, memberId: 1, status: "present" as const },
    { meetingId: 20, memberId: 1, status: "absent" as const },
    { meetingId: 20, memberId: 2, status: "excused" as const },
    { meetingId: 10, memberId: 3, status: "late" as const },
    { meetingId: 20, memberId: 3, status: "absent" as const },
  ];

  it("orders meetings by date, fills cells and computes totals", () => {
    const matrix = buildAttendanceMatrix({ members, meetings, rows });
    expect(matrix.meetings.map((m) => m.id)).toEqual([10, 20]);
    expect(matrix.meetings.map((m) => m.date)).toEqual(["2026-09-13", "2026-09-20"]);
    expect(matrix.meetings[0].totals).toEqual({ present: 1, absent: 0, excused: 0, late: 1, total: 2 });
    expect(matrix.meetings[1].totals).toEqual({ present: 0, absent: 2, excused: 1, late: 0, total: 3 });

    expect(matrix.groups.map((g) => g.label)).toEqual(["Psi", "Omega"]);
    const marcos = matrix.groups[0].rows[0];
    expect(marcos.cells).toEqual([null, "excused"]);
    expect(marcos.summary.total).toBe(1);
    expect(marcos.rate).toBe(100);

    const [gio, martin] = matrix.groups[1].rows;
    expect(gio.member.id).toBe(3);
    expect(gio.cells).toEqual(["late", "absent"]);
    expect(gio.rate).toBe(50);
    expect(martin.cells).toEqual(["present", "absent"]);
    expect(martin.summary).toEqual({ present: 1, absent: 1, excused: 0, late: 0, total: 2 });
  });

  it("lists most absences highest first and skips members with none", () => {
    const matrix = buildAttendanceMatrix({ members, meetings, rows });
    const worst = mostAbsences(matrix);
    expect(worst.map((r) => r.member.id)).toEqual([3, 1]);
    expect(mostAbsences(matrix, 1)).toHaveLength(1);
  });
});
