import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseDollarsToCents } from "./money";

describe("money", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(250, { showPlus: true })).toBe("+$2.50");
    expect(formatCents(null)).toBe("$0.00");
  });

  it("parses dollar inputs", () => {
    expect(parseDollarsToCents("12")).toBe(1200);
    expect(parseDollarsToCents("12.5")).toBe(1250);
    expect(parseDollarsToCents("$1,234.56")).toBe(123456);
    expect(parseDollarsToCents("-3")).toBe(-300);
    expect(parseDollarsToCents(" 0.99 ")).toBe(99);
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents(null)).toBeNull();
  });

  it("renders input values", () => {
    expect(centsToInput(1250)).toBe("12.50");
    expect(centsToInput(null)).toBe("");
  });
});
