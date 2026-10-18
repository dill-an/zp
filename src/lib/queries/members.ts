import "server-only";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { chairHolders, chairs, members, pledgeClasses, type Chair, type ChairHolder, type Member, type PledgeClass } from "@/db/schema";
import { filterRoster, rosterSummary, type RosterParams, type RosterSummary } from "./members-logic";

export type ChairRef = Pick<Chair, "id" | "slug" | "name" | "category" | "isExec" | "isActive">;

export type RosterRow = Member & {
  pledgeClass: PledgeClass | null;
  /** Chairs currently held (open terms). */
  chairs: ChairRef[];
};

export type ChairTerm = ChairHolder & { chair: ChairRef };

export type MemberProfile = {
  member: Member;
  pledgeClass: PledgeClass | null;
  /** Open terms, most recent first. */
  currentChairs: ChairTerm[];
  /** Ended terms, most recent first. */
  chairHistory: ChairTerm[];
};

function currentChairRows(): { memberId: number; chair: ChairRef }[] {
  return db
    .select({
      memberId: chairHolders.memberId,
      chair: { id: chairs.id, slug: chairs.slug, name: chairs.name, category: chairs.category, isExec: chairs.isExec, isActive: chairs.isActive },
    })
    .from(chairHolders)
    .innerJoin(chairs, eq(chairs.id, chairHolders.chairId))
    .where(and(isNull(chairHolders.termEnd), eq(chairs.isActive, true)))
    .orderBy(asc(chairs.sortOrder))
    .all();
}

/** Every member with pledge class and current chairs, ordered by last name. */
export function listRoster(): RosterRow[] {
  const rows = db
    .select({ member: members, pledgeClass: pledgeClasses })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .orderBy(asc(members.lastName), asc(members.firstName))
    .all();
  const held = currentChairRows();
  return rows.map((r) => ({ ...r.member, pledgeClass: r.pledgeClass, chairs: held.filter((h) => h.memberId === r.member.id).map((h) => h.chair) }));
}

/** Roster rows matching the filters (search, status, class, labor group, chair holders, include inactive). */
export function searchMembers(params: RosterParams): RosterRow[] {
  return filterRoster(listRoster(), params);
}

export function summarizeRoster(rows: RosterRow[]): RosterSummary {
  return rosterSummary(rows);
}

/** Member, pledge class, chairs held now and before (with terms). */
export function getMemberProfile(id: number): MemberProfile | null {
  const row = db
    .select({ member: members, pledgeClass: pledgeClasses })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .where(eq(members.id, id))
    .get();
  if (!row) return null;
  const terms = db
    .select({
      holder: chairHolders,
      chair: { id: chairs.id, slug: chairs.slug, name: chairs.name, category: chairs.category, isExec: chairs.isExec, isActive: chairs.isActive },
    })
    .from(chairHolders)
    .innerJoin(chairs, eq(chairs.id, chairHolders.chairId))
    .where(eq(chairHolders.memberId, id))
    .orderBy(desc(chairHolders.termStart), desc(chairHolders.id))
    .all()
    .map((t) => ({ ...t.holder, chair: t.chair }));
  return {
    member: row.member,
    pledgeClass: row.pledgeClass,
    currentChairs: terms.filter((t) => t.termEnd == null),
    chairHistory: terms.filter((t) => t.termEnd != null),
  };
}

export type PledgeClassWithCount = PledgeClass & { memberCount: number };

export function listPledgeClassesWithCounts(): PledgeClassWithCount[] {
  const counts = db
    .select({ pledgeClassId: members.pledgeClassId, n: sql<number>`count(*)` })
    .from(members)
    .groupBy(members.pledgeClassId)
    .all();
  return db
    .select()
    .from(pledgeClasses)
    .orderBy(asc(pledgeClasses.sortOrder), asc(pledgeClasses.name))
    .all()
    .map((pc) => ({ ...pc, memberCount: counts.find((c) => c.pledgeClassId === pc.id)?.n ?? 0 }));
}

export function getPledgeClass(id: number): PledgeClass | null {
  return db.select().from(pledgeClasses).where(eq(pledgeClasses.id, id)).get() ?? null;
}

/** Is this username already used by another member? */
export function usernameTaken(username: string, excludeMemberId?: number): boolean {
  const row = db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.username, username), excludeMemberId != null ? ne(members.id, excludeMemberId) : undefined))
    .get();
  return !!row;
}

export function listUsernames(): string[] {
  return db
    .select({ username: members.username })
    .from(members)
    .all()
    .map((r) => r.username);
}

/** Number of open chair terms a member holds (any chair, active or not). */
export function countActiveTerms(memberId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(chairHolders)
    .where(and(eq(chairHolders.memberId, memberId), isNull(chairHolders.termEnd)))
    .get();
  return row?.n ?? 0;
}
