import { describe, expect, it } from "vitest";
import {
  buildLedger,
  centsToCsv,
  computeBalance,
  csvEscape,
  earliestUnpaidDue,
  inPeriod,
  memberStatus,
  nextInstallment,
  overallStatus,
  parseInstallments,
  parseInstallmentsJson,
  statusTone,
  toCsv,
} from "./dues-logic";

const TODAY = "2026-10-18";

describe("inPeriod", () => {
  it("includes everything when no period is given", () => {
    expect(inPeriod({ periodId: 1 }, undefined)).toBe(true);
    expect(inPeriod({ periodId: null }, undefined)).toBe(true);
  });
  it("matches a specific period and treats null as unassigned only", () => {
    expect(inPeriod({ periodId: 1 }, 1)).toBe(true);
    expect(inPeriod({ periodId: 2 }, 1)).toBe(false);
    expect(inPeriod({ periodId: null }, 1)).toBe(false);
    expect(inPeriod({ periodId: null }, null)).toBe(true);
    expect(inPeriod({}, null)).toBe(true);
  });
});

describe("computeBalance", () => {
  const charges = [
    { amountCents: 85000, periodId: 1, dueDate: "2026-11-01" },
    { amountCents: 2500, periodId: 1, dueDate: "2026-11-15" },
    { amountCents: -5000, periodId: 1, dueDate: null },
    { amountCents: 1000, periodId: null, dueDate: "2026-09-01" },
    { amountCents: 70000, periodId: 2, dueDate: "2026-03-01" },
  ];
  const payments = [
    { amountCents: 40000, periodId: 1 },
    { amountCents: 70000, periodId: 2 },
    { amountCents: 500, periodId: null },
  ];

  it("sums everything when no period is given, including rows without a period", () => {
    const b = computeBalance(charges, payments);
    expect(b.chargedCents).toBe(85000 + 2500 - 5000 + 1000 + 70000);
    expect(b.paidCents).toBe(40000 + 70000 + 500);
    expect(b.balanceCents).toBe(b.chargedCents - b.paidCents);
    expect(b.chargeCount).toBe(5);
  });

  it("restricts to one period and treats credits as negative charges", () => {
    const b = computeBalance(charges, payments, 1);
    expect(b.chargedCents).toBe(82500);
    expect(b.paidCents).toBe(40000);
    expect(b.balanceCents).toBe(42500);
    expect(b.chargeCount).toBe(3);
    // 40000 paid + 5000 credit covers only part of the 85000 charge due Nov 1.
    expect(b.earliestUnpaidDue).toBe("2026-11-01");
  });

  it("returns zeros for a member with no activity", () => {
    const b = computeBalance([], [], 1);
    expect(b).toEqual({ chargedCents: 0, paidCents: 0, balanceCents: 0, chargeCount: 0, earliestUnpaidDue: null });
  });

  it("scopes to unassigned rows with null", () => {
    const b = computeBalance(charges, payments, null);
    expect(b.chargedCents).toBe(1000);
    expect(b.paidCents).toBe(500);
    expect(b.balanceCents).toBe(500);
  });
});

describe("earliestUnpaidDue", () => {
  it("applies payments to charges in due-date order", () => {
    const charges = [
      { amountCents: 100, dueDate: "2026-02-01" },
      { amountCents: 200, dueDate: "2026-01-01" },
      { amountCents: 300, dueDate: null },
    ];
    expect(earliestUnpaidDue(charges, 0)).toBe("2026-01-01");
    expect(earliestUnpaidDue(charges, 200)).toBe("2026-02-01");
    expect(earliestUnpaidDue(charges, 250)).toBe("2026-02-01");
    expect(earliestUnpaidDue(charges, 300)).toBeNull(); // only the undated charge remains
    expect(earliestUnpaidDue(charges, 600)).toBeNull();
  });
  it("counts credits toward the oldest charge", () => {
    const charges = [{ amountCents: 100, dueDate: "2026-01-01" }, { amountCents: -100, dueDate: null }];
    expect(earliestUnpaidDue(charges, 0)).toBeNull();
  });
});

describe("memberStatus", () => {
  it("is none when nothing was charged", () => {
    expect(memberStatus({ chargedCents: 0, balanceCents: 0, earliestUnpaidDue: null }, TODAY)).toBe("none");
  });
  it("is paid when the balance is zero or negative and something was charged", () => {
    expect(memberStatus({ chargedCents: 85000, balanceCents: 0, earliestUnpaidDue: null }, TODAY)).toBe("paid");
    expect(memberStatus({ chargedCents: 85000, balanceCents: -2500, earliestUnpaidDue: null }, TODAY)).toBe("paid");
  });
  it("is paid for a fully credited period that still has charge rows", () => {
    expect(memberStatus({ chargedCents: 0, balanceCents: 0, earliestUnpaidDue: null, chargeCount: 2 }, TODAY)).toBe("paid");
  });
  it("is paid when a member only has credit", () => {
    expect(memberStatus({ chargedCents: 0, balanceCents: -1000, earliestUnpaidDue: null }, TODAY)).toBe("paid");
  });
  it("is unpaid when nothing has been paid", () => {
    expect(memberStatus({ chargedCents: 85000, balanceCents: 85000, earliestUnpaidDue: "2026-11-01" }, TODAY)).toBe("unpaid");
  });
  it("is partial when some has been paid", () => {
    expect(memberStatus({ chargedCents: 85000, balanceCents: 45000, earliestUnpaidDue: "2026-11-01" }, TODAY)).toBe("partial");
  });
  it("is overdue when the earliest unpaid charge is before today, regardless of partial payment", () => {
    expect(memberStatus({ chargedCents: 85000, balanceCents: 85000, earliestUnpaidDue: "2026-10-17" }, TODAY)).toBe("overdue");
    expect(memberStatus({ chargedCents: 85000, balanceCents: 100, earliestUnpaidDue: "2026-10-01" }, TODAY)).toBe("overdue");
  });
  it("is not overdue on the due date itself", () => {
    expect(memberStatus({ chargedCents: 85000, balanceCents: 85000, earliestUnpaidDue: TODAY }, TODAY)).toBe("unpaid");
  });
  it("is not overdue when the unpaid charge has no due date", () => {
    expect(memberStatus({ chargedCents: 100, balanceCents: 100, earliestUnpaidDue: null }, TODAY)).toBe("unpaid");
  });
});

describe("overallStatus", () => {
  it("is none without activity", () => {
    expect(overallStatus([])).toBe("none");
    expect(overallStatus([{ status: "none", balanceCents: 0 }])).toBe("none");
  });
  it("is unpaid when an old period is paid and the new one is untouched", () => {
    expect(
      overallStatus([
        { status: "paid", balanceCents: 0 },
        { status: "unpaid", balanceCents: 85000 },
      ]),
    ).toBe("unpaid");
  });
  it("is partial when something was paid toward what is still owed", () => {
    expect(
      overallStatus([
        { status: "paid", balanceCents: 0 },
        { status: "partial", balanceCents: 40000 },
      ]),
    ).toBe("partial");
    expect(
      overallStatus([
        { status: "unpaid", balanceCents: 1000 },
        { status: "partial", balanceCents: 40000 },
      ]),
    ).toBe("partial");
  });
  it("is overdue when any scope is overdue and money is owed", () => {
    expect(
      overallStatus([
        { status: "overdue", balanceCents: 1000 },
        { status: "unpaid", balanceCents: 85000 },
      ]),
    ).toBe("overdue");
  });
  it("is paid when credits elsewhere cover what is owed", () => {
    expect(
      overallStatus([
        { status: "paid", balanceCents: -85000 },
        { status: "unpaid", balanceCents: 85000 },
      ]),
    ).toBe("paid");
  });
});

describe("statusTone", () => {
  it("maps statuses to tones", () => {
    expect(statusTone("paid")).toBe("success");
    expect(statusTone("overdue")).toBe("danger");
    expect(statusTone("unpaid")).toBe("warning");
    expect(statusTone("partial")).toBe("warning");
    expect(statusTone("none")).toBeUndefined();
  });
});

describe("nextInstallment", () => {
  const plan = [
    { dueDate: "2026-11-01", amountCents: 30000 },
    { dueDate: "2026-12-01", amountCents: 30000 },
    { dueDate: "2027-01-01", amountCents: 25000 },
  ];
  it("returns the first installment when nothing is paid", () => {
    const next = nextInstallment(plan, 0, TODAY);
    expect(next).toMatchObject({ index: 0, dueDate: "2026-11-01", amountCents: 30000, remainingCents: 30000, overdue: false });
  });
  it("carries a partial payment into the current installment", () => {
    const next = nextInstallment(plan, 35000, TODAY);
    expect(next).toMatchObject({ index: 1, dueDate: "2026-12-01", remainingCents: 25000 });
  });
  it("flags an installment as overdue after its date", () => {
    expect(nextInstallment(plan, 0, "2026-11-02")?.overdue).toBe(true);
    expect(nextInstallment(plan, 0, "2026-11-01")?.overdue).toBe(false);
  });
  it("returns null when the plan is fully paid", () => {
    expect(nextInstallment(plan, 85000, TODAY)).toBeNull();
    expect(nextInstallment(plan, 90000, TODAY)).toBeNull();
  });
  it("sorts installments by date before walking them", () => {
    const unsorted = [plan[2], plan[0], plan[1]];
    expect(nextInstallment(unsorted, 0, TODAY)?.dueDate).toBe("2026-11-01");
  });
});

describe("parseInstallmentsJson", () => {
  it("parses and sorts valid JSON", () => {
    const json = JSON.stringify([
      { dueDate: "2026-12-01", amountCents: 100 },
      { dueDate: "2026-11-01", amountCents: 200 },
    ]);
    expect(parseInstallmentsJson(json)).toEqual([
      { dueDate: "2026-11-01", amountCents: 200 },
      { dueDate: "2026-12-01", amountCents: 100 },
    ]);
  });
  it("tolerates garbage", () => {
    expect(parseInstallmentsJson("not json")).toEqual([]);
    expect(parseInstallmentsJson(null)).toEqual([]);
    expect(parseInstallmentsJson(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseInstallmentsJson(JSON.stringify([{ dueDate: 1, amountCents: "x" }, { dueDate: "2026-01-01", amountCents: 5 }]))).toEqual([{ dueDate: "2026-01-01", amountCents: 5 }]);
  });
});

describe("parseInstallments", () => {
  const rows = [
    { dueDate: "2026-11-01", amount: "300" },
    { dueDate: "2026-12-01", amount: "300.00" },
    { dueDate: "2027-01-01", amount: "$250" },
  ];
  it("parses dollars into cents and sorts by date", () => {
    const result = parseInstallments([rows[2], rows[0], rows[1]], { totalCents: 85000 });
    expect(result).toEqual({
      ok: true,
      installments: [
        { dueDate: "2026-11-01", amountCents: 30000 },
        { dueDate: "2026-12-01", amountCents: 30000 },
        { dueDate: "2027-01-01", amountCents: 25000 },
      ],
    });
  });
  it("skips blank rows", () => {
    const result = parseInstallments([...rows, { dueDate: "", amount: "" }, {}, { dueDate: null, amount: null }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.installments).toHaveLength(3);
  });
  it("requires at least 3 and at most 6 rows", () => {
    expect(parseInstallments(rows.slice(0, 2))).toEqual({ ok: false, error: "A plan needs at least 3 installments." });
    const seven = Array.from({ length: 7 }, (_, i) => ({ dueDate: `2026-11-0${i + 1}`, amount: "10" }));
    expect(parseInstallments(seven)).toEqual({ ok: false, error: "A plan can have at most 6 installments." });
  });
  it("rejects bad dates and amounts with the row number", () => {
    expect(parseInstallments([{ dueDate: "11/01/2026", amount: "10" }, ...rows])).toEqual({ ok: false, error: "Row 1: enter a date." });
    expect(parseInstallments([rows[0], { dueDate: "2026-11-02", amount: "abc" }, rows[1]])).toEqual({ ok: false, error: "Row 2: enter a dollar amount." });
    expect(parseInstallments([rows[0], rows[1], { dueDate: "2026-11-02", amount: "0" }])).toEqual({ ok: false, error: "Row 3: amount must be more than $0." });
    expect(parseInstallments([rows[0], rows[1], { dueDate: "2026-11-02", amount: "-5" }])).toEqual({ ok: false, error: "Row 3: amount must be more than $0." });
  });
  it("requires the sum to match the balance", () => {
    const result = parseInstallments(rows, { totalCents: 90000 });
    expect(result).toEqual({ ok: false, error: "Installments add up to $850.00 but the balance is $900.00." });
  });
});

describe("buildLedger", () => {
  it("orders chronologically with a running balance and charges before payments at the same instant", () => {
    const charges = [
      { id: 1, amountCents: 85000, periodId: 1, dueDate: "2026-11-01", createdAt: "2026-10-01T12:00:00.000Z", kind: "dues", description: "Fall 2026 dues" },
      { id: 2, amountCents: -5000, periodId: 1, dueDate: null, createdAt: "2026-10-05T12:00:00.000Z", kind: "credit", description: "Cooked for rush" },
    ];
    const payments = [
      { id: 7, amountCents: 40000, periodId: 1, paidAt: "2026-10-01T12:00:00.000Z", method: "venmo", reference: "#123" },
      { id: 8, amountCents: 10000, periodId: 1, paidAt: "2026-10-10T12:00:00.000Z", method: "cash", reference: null },
    ];
    const ledger = buildLedger(charges, payments);
    expect(ledger.map((e) => `${e.type}:${e.id}`)).toEqual(["charge:1", "payment:7", "charge:2", "payment:8"]);
    expect(ledger.map((e) => e.runningBalanceCents)).toEqual([85000, 45000, 40000, 30000]);
    expect(ledger[1]).toMatchObject({ deltaCents: -40000, label: "Payment", detail: "venmo #123" });
    expect(ledger[3].detail).toBe("cash");
    expect(ledger[0].dueDate).toBe("2026-11-01");
  });
  it("handles an empty ledger", () => {
    expect(buildLedger([], [])).toEqual([]);
  });
});

describe("csv", () => {
  it("escapes only when needed", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(12.5)).toBe("12.5");
    expect(csvEscape("has,comma")).toBe('"has,comma"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
    expect(csvEscape(" padded ")).toBe('" padded "');
  });
  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["1", "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
  it("formats cents as decimals", () => {
    expect(centsToCsv(123456)).toBe("1234.56");
    expect(centsToCsv(-500)).toBe("-5.00");
    expect(centsToCsv(0)).toBe("0.00");
  });
});
