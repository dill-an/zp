import { describe, expect, it } from "vitest";
import {
  chairSlugFromName,
  csvEscape,
  filterRoster,
  formatResponsibilities,
  formatRosterSummary,
  groupChairsByCategory,
  isValidChairSlug,
  isValidUsername,
  normalizeUsername,
  parseResponsibilities,
  parseRosterParams,
  roleAfterChairAssign,
  roleAfterTermEnd,
  rosterParamsToQuery,
  rosterSummary,
  rosterToCsv,
  suggestUsername,
  termLabel,
  toCsv,
  type RosterRowLike,
} from "./members-logic";

describe("suggestUsername", () => {
  it("builds first.last from slugified names", () => {
    expect(suggestUsername("Dylan", "Nguyen")).toBe("dylan.nguyen");
    expect(suggestUsername("David", "Coll Leon")).toBe("david.coll-leon");
    expect(suggestUsername("Roy", "Rattler III")).toBe("roy.rattler-iii");
    expect(suggestUsername("  José ", "Peña")).toBe("jose.pena");
  });

  it("appends a counter until the name is free", () => {
    const taken = new Set(["jace.lopez", "jace.lopez2"]);
    expect(suggestUsername("Jace", "Lopez", taken)).toBe("jace.lopez3");
    expect(suggestUsername("Jace", "Lopez", ["Jace.Lopez"])).toBe("jace.lopez2");
    expect(suggestUsername("Jace", "Lopez", (u) => u === "jace.lopez")).toBe("jace.lopez2");
  });

  it("copes with empty names", () => {
    expect(suggestUsername("", "")).toBe("brother");
    expect(suggestUsername("Cher", "")).toBe("cher");
  });
});

describe("username validation", () => {
  it("normalizes and validates", () => {
    expect(normalizeUsername("  Gio.Mandwee ")).toBe("gio.mandwee");
    expect(isValidUsername("gio.mandwee")).toBe(true);
    expect(isValidUsername("david.coll-leon2")).toBe(true);
    expect(isValidUsername("Gio")).toBe(false);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("gio mandwee")).toBe(false);
    expect(isValidUsername("gio_mandwee")).toBe(false);
  });
});

describe("chair slugs", () => {
  it("uses underscores like the seeded chairs", () => {
    expect(chairSlugFromName("Vice President")).toBe("vice_president");
    expect(chairSlugFromName("Webmaster / IT")).toBe("webmaster_it");
    expect(chairSlugFromName("  New  Member Educator ")).toBe("new_member_educator");
  });
  it("validates", () => {
    expect(isValidChairSlug("treasurer")).toBe(true);
    expect(isValidChairSlug("social_chair")).toBe(true);
    expect(isValidChairSlug("social-chair")).toBe(false);
    expect(isValidChairSlug("a")).toBe(false);
    expect(isValidChairSlug("Treasurer")).toBe(false);
  });
});

describe("responsibilities", () => {
  it("parses bullet lines, stripping prefixes and blanks", () => {
    expect(parseResponsibilities("- Run meetings\n-  Take notes \n\n* Post minutes\n• Keep roster\nPlain line")).toEqual([
      "Run meetings",
      "Take notes",
      "Post minutes",
      "Keep roster",
      "Plain line",
    ]);
    expect(parseResponsibilities(null)).toEqual([]);
    expect(parseResponsibilities("   \n\n")).toEqual([]);
  });

  it("formats as '- ' lines and round-trips", () => {
    expect(formatResponsibilities(["Run meetings", " - Take notes", ""])).toBe("- Run meetings\n- Take notes");
    expect(formatResponsibilities([])).toBeNull();
    const text = "- A\n- B";
    expect(formatResponsibilities(parseResponsibilities(text))).toBe(text);
  });
});

const row = (over: Partial<RosterRowLike> & { id?: number }): RosterRowLike & { id: number } => ({
  id: over.id ?? 1,
  firstName: "Gio",
  lastName: "Mandwee",
  preferredName: "Gio",
  username: "gio.mandwee",
  status: "active",
  laborGroup: "cooks",
  pledgeClassId: 3,
  chairs: [],
  ...over,
});

const roster = [
  row({ id: 1 }),
  row({ id: 2, firstName: "Martin", lastName: "Meister", preferredName: "Martin", username: "martin.meister", laborGroup: "cleans" }),
  row({ id: 3, firstName: "Andrew", lastName: "Jacoby", preferredName: "Andy", username: "andrew.jacoby", laborGroup: "cleans", pledgeClassId: 2, chairs: [{}] }),
  row({ id: 4, firstName: "Marcos", lastName: "Arroyo-Cruz", preferredName: "Marcos", username: "marcos.arroyo-cruz", status: "new_member", laborGroup: "none", pledgeClassId: 4 }),
  row({ id: 5, firstName: "Old", lastName: "Timer", preferredName: "Old", username: "old.timer", status: "alumni", pledgeClassId: 1 }),
  row({ id: 6, firstName: "Gone", lastName: "Away", preferredName: "Gone", username: "gone.away", status: "inactive", pledgeClassId: 1 }),
];

describe("parseRosterParams", () => {
  it("reads known params and ignores junk", () => {
    expect(parseRosterParams({ q: " gio ", status: "active", class: "3", group: "cooks", chairs: "1", all: "1" })).toEqual({
      q: "gio",
      status: "active",
      pledgeClassId: 3,
      laborGroup: "cooks",
      chairHoldersOnly: true,
      includeInactive: true,
    });
    expect(parseRosterParams({ status: "bogus", class: "abc", group: ["cleans", "cooks"] })).toEqual({
      q: "",
      status: "",
      pledgeClassId: null,
      laborGroup: "cleans",
      chairHoldersOnly: false,
      includeInactive: false,
    });
  });

  it("round-trips through rosterParamsToQuery", () => {
    const qs = rosterParamsToQuery({ q: "gio", status: "abroad", pledgeClassId: 2, laborGroup: "cleans", chairHoldersOnly: true, includeInactive: true });
    expect(qs).toBe("q=gio&status=abroad&class=2&group=cleans&chairs=1&all=1");
    expect(rosterParamsToQuery({})).toBe("");
  });
});

describe("filterRoster", () => {
  it("hides inactive and alumni by default", () => {
    expect(filterRoster(roster, {}).map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(filterRoster(roster, { includeInactive: true }).map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("an explicit status filter overrides the default hiding", () => {
    expect(filterRoster(roster, { status: "alumni" }).map((m) => m.id)).toEqual([5]);
    expect(filterRoster(roster, { status: "new_member" }).map((m) => m.id)).toEqual([4]);
  });
  it("filters by pledge class, labor group and chair holders", () => {
    expect(filterRoster(roster, { pledgeClassId: 3 }).map((m) => m.id)).toEqual([1, 2]);
    expect(filterRoster(roster, { laborGroup: "cleans" }).map((m) => m.id)).toEqual([2, 3]);
    expect(filterRoster(roster, { chairHoldersOnly: true }).map((m) => m.id)).toEqual([3]);
  });
  it("searches first, last, preferred and username, all terms must match", () => {
    expect(filterRoster(roster, { q: "andy" }).map((m) => m.id)).toEqual([3]);
    expect(filterRoster(roster, { q: "jacoby" }).map((m) => m.id)).toEqual([3]);
    expect(filterRoster(roster, { q: "martin.meister" }).map((m) => m.id)).toEqual([2]);
    expect(filterRoster(roster, { q: "arroyo cruz" }).map((m) => m.id)).toEqual([4]);
    expect(filterRoster(roster, { q: "gio martin" })).toEqual([]);
  });
});

describe("rosterSummary", () => {
  const pc = (name: string, sortOrder: number) => ({ name, sortOrder });
  const rows = [
    { status: "active" as const, laborGroup: "cooks" as const, pledgeClass: pc("Omega", 2), chairs: [{}] },
    { status: "active" as const, laborGroup: "cleans" as const, pledgeClass: pc("Omega", 2) },
    { status: "new_member" as const, laborGroup: "none" as const, pledgeClass: pc("Beta Beta", 4) },
    { status: "abroad" as const, laborGroup: "cooks" as const, pledgeClass: pc("Psi", 1) },
    { status: "alumni" as const, laborGroup: "none" as const, pledgeClass: null },
    { status: "inactive" as const, laborGroup: "cleans" as const, pledgeClass: pc("Psi", 1) },
  ];
  it("counts statuses, labor groups and classes in class order with unassigned last", () => {
    const s = rosterSummary(rows);
    expect(s.total).toBe(6);
    expect(s.active).toBe(2);
    expect(s.newMembers).toBe(1);
    expect(s.abroad).toBe(1);
    expect(s.alumni).toBe(1);
    expect(s.inactive).toBe(1);
    expect(s.cooks).toBe(2);
    expect(s.cleans).toBe(2);
    expect(s.noLabor).toBe(2);
    expect(s.chairHolders).toBe(1);
    expect(s.byClass).toEqual([
      { name: "Psi", count: 2 },
      { name: "Omega", count: 2 },
      { name: "Beta Beta", count: 1 },
      { name: "No class", count: 1 },
    ]);
  });
  it("formats a one-line summary", () => {
    expect(formatRosterSummary(rosterSummary(rows))).toBe("2 active, 1 new member, 1 abroad, 1 inactive, 1 alumni · Psi 2, Omega 2, Beta Beta 1, No class 1 · 2 cooks, 2 cleans");
    expect(formatRosterSummary(rosterSummary([]))).toBe("0 active · 0 cooks, 0 cleans");
  });
});

describe("csv", () => {
  it("escapes quotes, commas and newlines; renders booleans and nulls", () => {
    expect(csvEscape('He said "hi", twice')).toBe('"He said ""hi"", twice"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(true)).toBe("yes");
    expect(csvEscape(42)).toBe("42");
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
  it("exports roster rows", () => {
    const csv = rosterToCsv([
      {
        firstName: "Gio",
        lastName: "Mandwee",
        preferredName: "Gio",
        username: "gio.mandwee",
        pledgeClass: { name: "Beta Alpha" },
        status: "active",
        laborGroup: "cooks",
        role: "member",
        chairs: [{ name: "Social Chair" }, { name: "Historian" }],
        email: null,
        phone: "617-555-0100",
        room: "3B",
        livesInHouse: true,
        major: "6-3",
        gradYear: 2027,
        birthday: null,
        emergencyContact: null,
        dietaryNotes: null,
      },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0].startsWith("First name,Last name,Preferred name,Username,Pledge class")).toBe(true);
    expect(lines[1]).toBe("Gio,Mandwee,Gio,gio.mandwee,Beta Alpha,active,cooks,member,Social Chair; Historian,,617-555-0100,3B,yes,6-3,2027,,,");
  });
});

describe("role sync", () => {
  it("promotes plain members on assignment and leaves others alone", () => {
    expect(roleAfterChairAssign("member")).toBe("officer");
    expect(roleAfterChairAssign("officer")).toBe("officer");
    expect(roleAfterChairAssign("admin")).toBe("admin");
  });
  it("demotes officers only when their last term ends, never admins", () => {
    expect(roleAfterTermEnd("officer", 0)).toBe("member");
    expect(roleAfterTermEnd("officer", 1)).toBe("officer");
    expect(roleAfterTermEnd("admin", 0)).toBe("admin");
    expect(roleAfterTermEnd("member", 0)).toBe("member");
  });
});

describe("groupChairsByCategory", () => {
  it("orders exec first and sorts within groups", () => {
    const grouped = groupChairsByCategory([
      { category: "internal", isExec: false, sortOrder: 2, name: "Historian" },
      { category: "house", isExec: false, sortOrder: 2, name: "Steward" },
      { category: "house", isExec: true, sortOrder: 5, name: "House Manager" },
      { category: "exec", isExec: true, sortOrder: 2, name: "Vice President" },
      { category: "exec", isExec: true, sortOrder: 1, name: "President" },
      { category: "weird", isExec: false, sortOrder: 0, name: "Mystery" },
    ]);
    expect(grouped.map((g) => g.category)).toEqual(["exec", "house", "internal", "weird"]);
    expect(grouped[0].label).toBe("Executive board");
    expect(grouped[0].chairs.map((c) => c.name)).toEqual(["President", "Vice President"]);
    expect(grouped[1].chairs.map((c) => c.name)).toEqual(["House Manager", "Steward"]);
    expect(grouped[3].label).toBe("weird");
  });
});

describe("termLabel", () => {
  const fmt = (d: string) => d;
  it("renders open and closed terms", () => {
    expect(termLabel("2026-09-01", null, fmt)).toBe("2026-09-01 to present");
    expect(termLabel("2025-09-01", "2026-05-15", fmt)).toBe("2025-09-01 to 2026-05-15");
  });
});
