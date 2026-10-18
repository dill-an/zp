import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chairHolders, chairs, members, pledgeClasses, type Chair, type Member, type PledgeClass } from "@/db/schema";

export type MemberWithClass = Member & { pledgeClass: PledgeClass | null };

/** Members ordered by last name. `activeOnly` keeps active, new_member and abroad statuses. */
export function listMembers(opts: { activeOnly?: boolean; laborPoolOnly?: boolean } = {}): MemberWithClass[] {
  const rows = db
    .select({ member: members, pledgeClass: pledgeClasses })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .where(
      and(
        opts.activeOnly ? inArray(members.status, ["active", "new_member", "abroad"]) : undefined,
        opts.laborPoolOnly ? inArray(members.laborGroup, ["cooks", "cleans"]) : undefined,
      ),
    )
    .orderBy(asc(members.lastName), asc(members.firstName))
    .all();
  return rows.map((r) => ({ ...r.member, pledgeClass: r.pledgeClass }));
}

export function getMember(id: number): MemberWithClass | null {
  const row = db
    .select({ member: members, pledgeClass: pledgeClasses })
    .from(members)
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .where(eq(members.id, id))
    .get();
  return row ? { ...row.member, pledgeClass: row.pledgeClass } : null;
}

export function listPledgeClasses(): PledgeClass[] {
  return db.select().from(pledgeClasses).orderBy(asc(pledgeClasses.sortOrder)).all();
}

export type ChairWithHolders = Chair & { holders: Member[] };

/** Active chairs with their current holders. */
export function listChairs(opts: { includeInactive?: boolean } = {}): ChairWithHolders[] {
  const chairRows = db
    .select()
    .from(chairs)
    .where(opts.includeInactive ? undefined : eq(chairs.isActive, true))
    .orderBy(asc(chairs.sortOrder))
    .all();
  const holderRows = db
    .select({ chairId: chairHolders.chairId, member: members })
    .from(chairHolders)
    .innerJoin(members, eq(members.id, chairHolders.memberId))
    .where(isNull(chairHolders.termEnd))
    .all();
  return chairRows.map((c) => ({ ...c, holders: holderRows.filter((h) => h.chairId === c.id).map((h) => h.member) }));
}

export function getChairBySlug(slug: string): ChairWithHolders | null {
  return listChairs({ includeInactive: true }).find((c) => c.slug === slug) ?? null;
}

/** Group members by pledge class name for <optgroup> rendering; unassigned last. */
export function groupByPledgeClass(list: MemberWithClass[]): { label: string; members: MemberWithClass[] }[] {
  const groups = new Map<string, MemberWithClass[]>();
  for (const m of list) {
    const key = m.pledgeClass?.name ?? "No pledge class";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }
  const classes = listPledgeClasses().map((c) => c.name);
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = classes.indexOf(a[0]);
      const ib = classes.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([label, ms]) => ({ label, members: ms }));
}
