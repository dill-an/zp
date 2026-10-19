import "server-only";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { auditLog, charges, members, sanctions, type AuditEntry, type Charge, type Sanction } from "@/db/schema";
import { displayName } from "@/lib/names";
import {
  filterSanctions,
  houseBoard,
  isOverdue,
  sanctionStats,
  sortSanctions,
  summarizeJobs,
  type HouseBoardCounts,
  type HouseBoardRow,
  type JobSummary,
  type SanctionFilters,
  type SanctionStats,
  type SanctionTab,
} from "./sanctions-logic";

export type MemberRef = { id: number; firstName: string; lastName: string; preferredName: string; username: string };

export type SanctionRow = Sanction & {
  member: MemberRef;
  issuedBy: MemberRef | null;
  verifiedBy: MemberRef | null;
  /** Sum of linked `fine` charges (null when no fine charge row exists). */
  fineChargeCents: number | null;
  /** Display name, for the free-text filter. */
  memberName: string;
  overdue: boolean;
};

export type SanctionDetail = SanctionRow & {
  charges: Charge[];
  /** Audit entries for this sanction, oldest first (used for the timeline). */
  history: (AuditEntry & { actor: MemberRef | null })[];
};

const issuer = alias(members, "issuer");
const verifier = alias(members, "verifier");

type MemberColsSource = { id: SQLiteColumn; firstName: SQLiteColumn; lastName: SQLiteColumn; preferredName: SQLiteColumn; username: SQLiteColumn };

/** Picks the display columns from `members` or any alias of it (aliases carry a different table name type). */
function memberCols<T extends MemberColsSource>(t: T): { id: T["id"]; firstName: T["firstName"]; lastName: T["lastName"]; preferredName: T["preferredName"]; username: T["username"] } {
  return { id: t.id, firstName: t.firstName, lastName: t.lastName, preferredName: t.preferredName, username: t.username };
}

function baseSelect() {
  return db
    .select({
      sanction: sanctions,
      member: memberCols(members),
      issuedBy: memberCols(issuer),
      verifiedBy: memberCols(verifier),
    })
    .from(sanctions)
    .innerJoin(members, eq(members.id, sanctions.memberId))
    .leftJoin(issuer, eq(issuer.id, sanctions.issuedById))
    .leftJoin(verifier, eq(verifier.id, sanctions.verifiedById));
}

/** Linked fine totals keyed by sanction id (only `kind = fine` rows). */
function fineTotals(sanctionIds: number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (sanctionIds.length === 0) return out;
  const rows = db
    .select({ sanctionId: charges.sanctionId, kind: charges.kind, amountCents: charges.amountCents })
    .from(charges)
    .where(and(inArray(charges.sanctionId, sanctionIds), eq(charges.kind, "fine")))
    .all();
  for (const r of rows) if (r.sanctionId != null) out.set(r.sanctionId, (out.get(r.sanctionId) ?? 0) + r.amountCents);
  return out;
}

function toRows(
  raw: { sanction: Sanction; member: MemberRef; issuedBy: MemberRef | null; verifiedBy: MemberRef | null }[],
  now: Date,
): SanctionRow[] {
  const fines = fineTotals(raw.map((r) => r.sanction.id));
  return raw.map((r) => ({
    ...r.sanction,
    member: r.member,
    issuedBy: r.issuedBy?.id != null ? r.issuedBy : null,
    verifiedBy: r.verifiedBy?.id != null ? r.verifiedBy : null,
    fineChargeCents: fines.get(r.sanction.id) ?? null,
    memberName: displayName(r.member),
    overdue: isOverdue(r.sanction, now),
  }));
}

export type ListSanctionsFilters = SanctionFilters & {
  /** Board tab; defaults to "all". */
  tab?: SanctionTab;
};

/** All sanctions (optionally narrowed by tab, member, source, text) in work-first order. */
export function listSanctions(filters: ListSanctionsFilters = {}, now: Date = new Date()): SanctionRow[] {
  const raw = baseSelect()
    .where(filters.memberId != null ? eq(sanctions.memberId, filters.memberId) : undefined)
    .orderBy(desc(sanctions.issuedAt), desc(sanctions.id))
    .all();
  const rows = toRows(raw, now);
  return sortSanctions(filterSanctions(rows, filters.tab ?? "all", filters));
}

/** One sanction with member, issuer, verifier, linked charges and audit history; null when missing. */
export function getSanction(id: number, now: Date = new Date()): SanctionDetail | null {
  const raw = baseSelect().where(eq(sanctions.id, id)).get();
  if (!raw) return null;
  const [row] = toRows([raw], now);
  const linked = db.select().from(charges).where(eq(charges.sanctionId, id)).orderBy(asc(charges.createdAt), asc(charges.id)).all();
  const actor = alias(members, "actor");
  const history = db
    .select({ entry: auditLog, actor: memberCols(actor) })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, "sanction"), eq(auditLog.entityId, String(id))))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
    .all()
    .map((h) => ({ ...h.entry, actor: h.actor?.id != null ? h.actor : null }));
  return { ...row, charges: linked, history };
}

/** Sanctions a brother still has to act on: open, in progress or under appeal (soonest due first). */
export function getOpenSanctionsForMember(memberId: number, now: Date = new Date()): SanctionRow[] {
  const raw = baseSelect()
    .where(and(eq(sanctions.memberId, memberId), inArray(sanctions.status, ["open", "in_progress", "appealed"])))
    .all();
  return sortSanctions(toRows(raw, now));
}

/** Everything for one brother (for the "My sanctions" page). */
export function getSanctionsForMember(memberId: number, now: Date = new Date()): SanctionRow[] {
  return listSanctions({ memberId }, now);
}

/** Headline numbers for the standards board and the dashboard. */
export function getSanctionStats(now: Date = new Date()): SanctionStats {
  const all = db.select().from(sanctions).all();
  const fineCharges = db
    .select({ sanctionId: charges.sanctionId, kind: charges.kind, amountCents: charges.amountCents })
    .from(charges)
    .where(and(isNotNull(charges.sanctionId), eq(charges.kind, "fine")))
    .all();
  return sanctionStats(all, fineCharges, now);
}

/** Punishment jobs grouped by description: how many have done each, who still needs to. */
export function getJobSummary(now: Date = new Date()): JobSummary[] {
  return summarizeJobs(listSanctions({}, now));
}

export type HouseBoardEntry = HouseBoardRow & { member: MemberRef };

/** The read-only house board every brother may see: outstanding jobs, this semester's done jobs and the counts. */
export function getHouseBoard(now: Date = new Date()): { open: HouseBoardEntry[]; done: HouseBoardEntry[]; counts: HouseBoardCounts } {
  const rows = listSanctions({}, now);
  const membersById = new Map(rows.map((r) => [r.memberId, r.member]));
  const board = houseBoard(rows, now);
  const attach = (r: HouseBoardRow): HouseBoardEntry[] => {
    const member = membersById.get(r.memberId);
    return member ? [{ ...r, member }] : [];
  };
  return { open: board.open.flatMap(attach), done: board.done.flatMap(attach), counts: board.counts };
}
