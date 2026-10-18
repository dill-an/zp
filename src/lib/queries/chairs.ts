import "server-only";
import { and, asc, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chairHolders, chairs, members, tasks, type Chair, type ChairHolder, type Member, type Task } from "@/db/schema";

export type MemberRef = Pick<Member, "id" | "firstName" | "lastName" | "preferredName" | "username" | "role" | "status">;
export type HolderWithMember = ChairHolder & { member: MemberRef };

export type ChairTaskCounts = { open: number; overdue: number };

const memberRef = {
  id: members.id,
  firstName: members.firstName,
  lastName: members.lastName,
  preferredName: members.preferredName,
  username: members.username,
  role: members.role,
  status: members.status,
};

const OPEN_STATUSES_EXCLUDED = ["done", "cancelled"] as const;

/** Open (not done/cancelled) and overdue task counts per chair id. */
export function getOpenTaskCountsByChair(): Map<number, ChairTaskCounts> {
  const now = new Date().toISOString();
  const rows = db
    .select({
      chairId: tasks.chairId,
      open: sql<number>`count(*)`,
      overdue: sql<number>`sum(case when ${tasks.dueAt} is not null and ${tasks.dueAt} < ${now} then 1 else 0 end)`,
    })
    .from(tasks)
    .where(notInArray(tasks.status, [...OPEN_STATUSES_EXCLUDED]))
    .groupBy(tasks.chairId)
    .all();
  const map = new Map<number, ChairTaskCounts>();
  for (const r of rows) if (r.chairId != null) map.set(r.chairId, { open: Number(r.open) || 0, overdue: Number(r.overdue) || 0 });
  return map;
}

export type ChairWithCounts = Chair & { holders: HolderWithMember[]; open: number; overdue: number };

/** Chairs (active by default) with current holders and open/overdue task counts, by sortOrder. */
export function listChairsWithCounts(opts: { includeInactive?: boolean } = {}): ChairWithCounts[] {
  const chairRows = db
    .select()
    .from(chairs)
    .where(opts.includeInactive ? undefined : eq(chairs.isActive, true))
    .orderBy(asc(chairs.sortOrder), asc(chairs.name))
    .all();
  const holders = db
    .select({ holder: chairHolders, member: memberRef })
    .from(chairHolders)
    .innerJoin(members, eq(members.id, chairHolders.memberId))
    .where(isNull(chairHolders.termEnd))
    .orderBy(asc(chairHolders.termStart))
    .all();
  const counts = getOpenTaskCountsByChair();
  return chairRows.map((c) => ({
    ...c,
    holders: holders.filter((h) => h.holder.chairId === c.id).map((h) => ({ ...h.holder, member: h.member })),
    open: counts.get(c.id)?.open ?? 0,
    overdue: counts.get(c.id)?.overdue ?? 0,
  }));
}

export type ChairDetail = {
  chair: Chair;
  /** Open terms, earliest start first. */
  holders: HolderWithMember[];
  /** Ended terms, most recent first. */
  history: HolderWithMember[];
  /** The 10 most recently created open tasks. */
  openTasks: Pick<Task, "id" | "title" | "status" | "priority" | "dueAt" | "createdAt">[];
  open: number;
  overdue: number;
};

export function getChairDetail(slug: string): ChairDetail | null {
  const chair = db.select().from(chairs).where(eq(chairs.slug, slug)).get();
  if (!chair) return null;
  const terms = db
    .select({ holder: chairHolders, member: memberRef })
    .from(chairHolders)
    .innerJoin(members, eq(members.id, chairHolders.memberId))
    .where(eq(chairHolders.chairId, chair.id))
    .orderBy(desc(chairHolders.termStart), desc(chairHolders.id))
    .all()
    .map((t) => ({ ...t.holder, member: t.member }));
  const openTasks = db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority, dueAt: tasks.dueAt, createdAt: tasks.createdAt })
    .from(tasks)
    .where(and(eq(tasks.chairId, chair.id), notInArray(tasks.status, [...OPEN_STATUSES_EXCLUDED])))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(10)
    .all();
  const counts = getOpenTaskCountsByChair().get(chair.id);
  return {
    chair,
    holders: terms.filter((t) => t.termEnd == null).sort((a, b) => a.termStart.localeCompare(b.termStart) || a.id - b.id),
    history: terms.filter((t) => t.termEnd != null),
    openTasks,
    open: counts?.open ?? 0,
    overdue: counts?.overdue ?? 0,
  };
}

export function getChair(id: number): Chair | null {
  return db.select().from(chairs).where(eq(chairs.id, id)).get() ?? null;
}

export function chairSlugTaken(slug: string): boolean {
  return !!db.select({ id: chairs.id }).from(chairs).where(eq(chairs.slug, slug)).get();
}

export function getChairHolder(id: number): ChairHolder | null {
  return db.select().from(chairHolders).where(eq(chairHolders.id, id)).get() ?? null;
}
