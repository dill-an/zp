/**
 * Pure helpers for the members module (roster, profiles, pledge classes, chairs).
 * No database or Next.js imports so everything here is unit-testable.
 */
import { LABOR_GROUPS, MEMBER_STATUSES, type LaborGroup, type MemberStatus } from "@/db/schema";
import { slugify } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Usernames                                                           */
/* ------------------------------------------------------------------ */

export const USERNAME_PATTERN = /^[a-z0-9.-]+$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return input.length >= 3 && input.length <= 40 && USERNAME_PATTERN.test(input);
}

/**
 * Suggest `first.last`, falling back to `first.last2`, `first.last3`, ... until the name is free.
 * `taken` may be a Set, an array, or a predicate.
 */
export function suggestUsername(first: string, last: string, taken: Iterable<string> | ((username: string) => boolean) = []): string {
  const isTaken = typeof taken === "function" ? taken : ((set) => (u: string) => set.has(u))(new Set([...taken].map((t) => t.toLowerCase())));
  const a = slugify(first) || "brother";
  const b = slugify(last);
  const base = b ? `${a}.${b}` : a;
  let candidate = base;
  let i = 2;
  while (isTaken(candidate)) candidate = `${base}${i++}`;
  return candidate;
}

/* ------------------------------------------------------------------ */
/* Chair slugs and responsibilities                                    */
/* ------------------------------------------------------------------ */

export const CHAIR_SLUG_PATTERN = /^[a-z0-9_]+$/;

/** Seeded chairs use underscore slugs ("vice_president"), which also read well once humanized. */
export function chairSlugFromName(name: string): string {
  return slugify(name).replace(/-+/g, "_");
}

export function isValidChairSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 60 && CHAIR_SLUG_PATTERN.test(slug);
}

/** Split a responsibilities blob into clean lines, stripping bullet prefixes and blanks. */
export function parseResponsibilities(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]\s*)+/, "").trim())
    .filter((line) => line.length > 0);
}

/** Store responsibilities as "- " bullet lines; returns null when there is nothing to store. */
export function formatResponsibilities(lines: string[]): string | null {
  const clean = lines.map((l) => l.trim().replace(/^(?:[-*•]\s*)+/, "").trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return clean.map((l) => `- ${l}`).join("\n");
}

/* ------------------------------------------------------------------ */
/* Roster filtering and summary                                       */
/* ------------------------------------------------------------------ */

export type RosterParams = {
  q?: string;
  status?: MemberStatus | "";
  pledgeClassId?: number | null;
  laborGroup?: LaborGroup | "";
  chairHoldersOnly?: boolean;
  /** Show inactive and alumni members too. */
  includeInactive?: boolean;
};

type SearchParamValue = string | string[] | undefined;

function first(v: SearchParamValue): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Parse URL search params (`q`, `status`, `class`, `group`, `chairs`, `all`) into RosterParams. */
export function parseRosterParams(sp: Record<string, SearchParamValue>): RosterParams {
  const status = first(sp.status);
  const group = first(sp.group);
  const cls = first(sp.class);
  const classId = cls && /^\d+$/.test(cls) ? Number(cls) : null;
  return {
    q: first(sp.q).trim(),
    status: (MEMBER_STATUSES as readonly string[]).includes(status) ? (status as MemberStatus) : "",
    pledgeClassId: classId,
    laborGroup: (LABOR_GROUPS as readonly string[]).includes(group) ? (group as LaborGroup) : "",
    chairHoldersOnly: first(sp.chairs) === "1",
    includeInactive: first(sp.all) === "1",
  };
}

/** Build the query string for a set of roster params (used by the export link and filter form). */
export function rosterParamsToQuery(p: RosterParams): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.status) qs.set("status", p.status);
  if (p.pledgeClassId != null) qs.set("class", String(p.pledgeClassId));
  if (p.laborGroup) qs.set("group", p.laborGroup);
  if (p.chairHoldersOnly) qs.set("chairs", "1");
  if (p.includeInactive) qs.set("all", "1");
  return qs.toString();
}

export type RosterRowLike = {
  firstName: string;
  lastName: string;
  preferredName: string;
  username: string;
  status: MemberStatus;
  laborGroup: LaborGroup;
  pledgeClassId: number | null;
  chairs: unknown[];
};

const HIDDEN_BY_DEFAULT: readonly MemberStatus[] = ["inactive", "alumni"];

/** Apply roster filters in memory (the house has about 42 members). */
export function filterRoster<T extends RosterRowLike>(rows: T[], params: RosterParams): T[] {
  const q = (params.q ?? "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return rows.filter((m) => {
    if (params.status) {
      if (m.status !== params.status) return false;
    } else if (!params.includeInactive && HIDDEN_BY_DEFAULT.includes(m.status)) {
      return false;
    }
    if (params.pledgeClassId != null && m.pledgeClassId !== params.pledgeClassId) return false;
    if (params.laborGroup && m.laborGroup !== params.laborGroup) return false;
    if (params.chairHoldersOnly && m.chairs.length === 0) return false;
    if (terms.length) {
      const hay = `${m.firstName} ${m.lastName} ${m.preferredName} ${m.username}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/**
 * Brothers who belong on the default roster (not inactive or alumni) but have no pledge class.
 * A data hygiene list for members.manage; the seed ships one such brother.
 */
export function membersMissingClass<T extends { pledgeClassId: number | null; status: MemberStatus }>(rows: readonly T[]): T[] {
  return rows.filter((m) => m.pledgeClassId == null && !HIDDEN_BY_DEFAULT.includes(m.status));
}

/* ------------------------------------------------------------------ */
/* Contact details                                                     */
/* ------------------------------------------------------------------ */

export type ContactField = "phone" | "email" | "room";

export const CONTACT_FIELD_LABELS: Record<ContactField, string> = { phone: "phone number", email: "email address", room: "room" };

/**
 * Contact details a brother has left blank, in display order (phone, email, room).
 * Whitespace counts as blank. A room is only expected from brothers who live in the house, so when
 * `livesInHouse` is false a missing room is not reported. Empty when everything is filled in.
 */
export function missingContactFields(member: { phone: string | null; email: string | null; room: string | null; livesInHouse?: boolean }): ContactField[] {
  const blank = (v: string | null | undefined) => v == null || v.trim().length === 0;
  const out: ContactField[] = [];
  if (blank(member.phone)) out.push("phone");
  if (blank(member.email)) out.push("email");
  if (member.livesInHouse !== false && blank(member.room)) out.push("room");
  return out;
}

export type RosterSummary = {
  total: number;
  active: number;
  newMembers: number;
  abroad: number;
  inactive: number;
  alumni: number;
  cooks: number;
  cleans: number;
  noLabor: number;
  chairHolders: number;
  byClass: { name: string; count: number }[];
};

type SummaryRowLike = {
  status: MemberStatus;
  laborGroup: LaborGroup;
  pledgeClass: { name: string; sortOrder: number } | null;
  chairs?: unknown[];
};

export function rosterSummary(rows: SummaryRowLike[]): RosterSummary {
  const s: RosterSummary = {
    total: rows.length,
    active: 0,
    newMembers: 0,
    abroad: 0,
    inactive: 0,
    alumni: 0,
    cooks: 0,
    cleans: 0,
    noLabor: 0,
    chairHolders: 0,
    byClass: [],
  };
  const classes = new Map<string, { name: string; sortOrder: number; count: number }>();
  for (const m of rows) {
    if (m.status === "active") s.active++;
    else if (m.status === "new_member") s.newMembers++;
    else if (m.status === "abroad") s.abroad++;
    else if (m.status === "inactive") s.inactive++;
    else if (m.status === "alumni") s.alumni++;
    if (m.laborGroup === "cooks") s.cooks++;
    else if (m.laborGroup === "cleans") s.cleans++;
    else s.noLabor++;
    if (m.chairs && m.chairs.length > 0) s.chairHolders++;
    const key = m.pledgeClass?.name ?? "No class";
    const entry = classes.get(key) ?? { name: key, sortOrder: m.pledgeClass ? m.pledgeClass.sortOrder : Number.MAX_SAFE_INTEGER, count: 0 };
    entry.count++;
    classes.set(key, entry);
  }
  s.byClass = [...classes.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(({ name, count }) => ({ name, count }));
  return s;
}

/** One-line roster summary: "28 active, 14 new members · Psi 5, Omega 12 · 17 cooks, 13 cleans". */
export function formatRosterSummary(s: RosterSummary): string {
  const statusBits: string[] = [];
  statusBits.push(`${s.active} active`);
  if (s.newMembers) statusBits.push(`${s.newMembers} new ${s.newMembers === 1 ? "member" : "members"}`);
  if (s.abroad) statusBits.push(`${s.abroad} abroad`);
  if (s.inactive) statusBits.push(`${s.inactive} inactive`);
  if (s.alumni) statusBits.push(`${s.alumni} alumni`);
  const parts = [statusBits.join(", ")];
  if (s.byClass.length) parts.push(s.byClass.map((c) => `${c.name} ${c.count}`).join(", "));
  parts.push(`${s.cooks} cooks, ${s.cleans} cleans`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\r\n") + "\r\n";
}

export type RosterCsvRow = {
  firstName: string;
  lastName: string;
  preferredName: string;
  username: string;
  pledgeClass: { name: string } | null;
  status: MemberStatus;
  laborGroup: LaborGroup;
  role: string;
  chairs: { name: string }[];
  email: string | null;
  phone: string | null;
  room: string | null;
  livesInHouse: boolean;
  major: string | null;
  gradYear: number | null;
  birthday: string | null;
  emergencyContact: string | null;
  dietaryNotes: string | null;
};

export const ROSTER_CSV_HEADERS = [
  "First name",
  "Last name",
  "Preferred name",
  "Username",
  "Pledge class",
  "Status",
  "Labor group",
  "Role",
  "Chairs",
  "Email",
  "Phone",
  "Room",
  "Lives in house",
  "Major",
  "Grad year",
  "Birthday",
  "Emergency contact",
  "Dietary notes",
];

export function rosterToCsv(rows: RosterCsvRow[]): string {
  return toCsv(
    ROSTER_CSV_HEADERS,
    rows.map((m) => [
      m.firstName,
      m.lastName,
      m.preferredName,
      m.username,
      m.pledgeClass?.name ?? "",
      m.status,
      m.laborGroup,
      m.role,
      m.chairs.map((c) => c.name).join("; "),
      m.email,
      m.phone,
      m.room,
      m.livesInHouse,
      m.major,
      m.gradYear,
      m.birthday,
      m.emergencyContact,
      m.dietaryNotes,
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Role sync for chair holders                                         */
/* ------------------------------------------------------------------ */

type Role = "admin" | "officer" | "member";

/** A plain member who takes a chair becomes an officer; admins and officers are unchanged. */
export function roleAfterChairAssign(role: Role): Role {
  return role === "member" ? "officer" : role;
}

/** When the last active term ends an officer becomes a member again; admins are never touched. */
export function roleAfterTermEnd(role: Role, remainingActiveTerms: number): Role {
  if (role === "officer" && remainingActiveTerms === 0) return "member";
  return role;
}

/**
 * May someone with members.manage reset this member's password or change their status?
 * Only an admin may act on another admin; otherwise a secretary could lock out or take over an admin account.
 */
export function canManageMemberAccount(actorRole: Role, targetRole: Role): boolean {
  return targetRole !== "admin" || actorRole === "admin";
}

/* ------------------------------------------------------------------ */
/* Chair grouping                                                      */
/* ------------------------------------------------------------------ */

export const CHAIR_CATEGORY_ORDER = ["exec", "house", "social", "internal", "external"] as const;
export const CHAIR_CATEGORY_LABELS: Record<(typeof CHAIR_CATEGORY_ORDER)[number], string> = {
  exec: "Executive board",
  house: "House operations",
  social: "Social",
  internal: "Internal",
  external: "External",
};

/** Group chairs by category in display order; exec first. Within a group, isExec first then sortOrder then name. */
export function groupChairsByCategory<T extends { category: string; isExec: boolean; sortOrder: number; name: string }>(
  chairsList: T[],
): { category: string; label: string; chairs: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const c of chairsList) (groups.get(c.category) ?? groups.set(c.category, []).get(c.category)!).push(c);
  const order = [...CHAIR_CATEGORY_ORDER] as string[];
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([category, list]) => ({
      category,
      label: (CHAIR_CATEGORY_LABELS as Record<string, string>)[category] ?? category,
      chairs: [...list].sort((a, b) => Number(b.isExec) - Number(a.isExec) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    }));
}

/** Format a holder term: "Sep 1, 2026 to present" / "Sep 1, 2025 to May 15, 2026". */
export function termLabel(termStart: string, termEnd: string | null, fmt: (d: string) => string): string {
  return termEnd ? `${fmt(termStart)} to ${fmt(termEnd)}` : `${fmt(termStart)} to present`;
}
