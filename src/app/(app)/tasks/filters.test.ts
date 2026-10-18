import { describe, expect, it } from "vitest";
import { parseFilters, tabHref } from "./filters";

describe("parseFilters", () => {
  it("defaults to Mine with nothing set, and lands a bare ?assignee= or ?chair= link on Open", () => {
    expect(parseFilters({})).toMatchObject({ tab: "mine", active: false });
    expect(parseFilters({ assignee: "18" })).toMatchObject({ tab: "open", assigneeId: 18, active: true });
    expect(parseFilters({ chair: "3" })).toMatchObject({ tab: "open", chairId: 3, chairParam: "3", active: true });
    expect(parseFilters({ chair: "general" })).toMatchObject({ tab: "open", chairId: "general", active: true });
  });
  it("ignores an assignee filter on the Mine tab, which is always the current user", () => {
    const f = parseFilters({ tab: "mine", assignee: "18" });
    expect(f.tab).toBe("mine");
    expect(f.assigneeId).toBeUndefined();
    expect(f.active).toBe(false);
    // Other filters still count as active there.
    expect(parseFilters({ tab: "mine", assignee: "18", priority: "high" })).toMatchObject({ assigneeId: undefined, priority: "high", active: true });
    // And the assignee is honoured on every other tab.
    expect(parseFilters({ tab: "done", assignee: "18" })).toMatchObject({ tab: "done", assigneeId: 18, active: true });
  });
  it("drops unknown tabs, statuses and priorities", () => {
    expect(parseFilters({ tab: "nope", status: "weird", priority: "max", assignee: "x" })).toMatchObject({
      tab: "mine",
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
      active: false,
    });
    expect(parseFilters({ status: "overdue" })).toMatchObject({ tab: "open", status: "overdue" });
  });
});

describe("tabHref", () => {
  it("keeps the filters when switching tabs, except the assignee on Mine", () => {
    const f = parseFilters({ tab: "open", assignee: "18", chair: "3", q: "mixer" });
    expect(tabHref("chair", f)).toBe("/tasks?tab=chair&chair=3&assignee=18&q=mixer");
    expect(tabHref("done", f)).toBe("/tasks?tab=done&chair=3&assignee=18&q=mixer");
    expect(tabHref("mine", f)).toBe("/tasks?tab=mine&chair=3&q=mixer");
  });
  it("round-trips: the Mine href parses back without an active assignee filter", () => {
    const f = parseFilters({ assignee: "18" });
    const sp = Object.fromEntries(new URL(`http://x${tabHref("mine", f)}`).searchParams);
    expect(parseFilters(sp)).toMatchObject({ tab: "mine", assigneeId: undefined, active: false });
  });
});
