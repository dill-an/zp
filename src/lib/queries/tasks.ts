import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  chairHolders,
  chairs,
  members,
  taskActivity,
  taskAssignees,
  taskChecklistItems,
  tasks,
  type Chair,
  type Member,
  type Task,
  type TaskActivityRow,
  type TaskPriority,
  type TaskStatus,
} from "@/db/schema";
import { OPEN_STATUSES, isOverdue, sortTasks } from "./tasks-logic";

export type TaskChair = Pick<Chair, "id" | "name" | "slug" | "sortOrder" | "isActive">;
export type TaskPerson = Pick<Member, "id" | "firstName" | "lastName" | "preferredName" | "username" | "status">;
export type ChecklistItem = { id: number; taskId: number; label: string; isDone: boolean; sortOrder: number };
export type TaskActivityEntry = TaskActivityRow & { member: TaskPerson | null };

/** A task row plus everything a list row needs. */
export type TaskListItem = Task & {
  chair: TaskChair | null;
  creator: TaskPerson | null;
  completedBy: TaskPerson | null;
  assignees: TaskPerson[];
  checklist: { done: number; total: number };
};

/** Everything the detail page needs. */
export type TaskDetail = TaskListItem & {
  checklistItems: ChecklistItem[];
  activity: TaskActivityEntry[];
};

export type TaskStatusFilter = TaskStatus | "open" | "overdue" | "closed";

export type TaskFilters = {
  /** A chair id, or "general" for tasks with no chair. */
  chairId?: number | "general";
  assigneeId?: number;
  createdById?: number;
  status?: TaskStatusFilter;
  priority?: TaskPriority;
  /** Title/description substring. */
  q?: string;
  /** "due" (overdue first, then due ascending; the default) or "completed" (most recently completed first). */
  order?: "due" | "completed";
  limit?: number;
};

const personColumns = {
  id: members.id,
  firstName: members.firstName,
  lastName: members.lastName,
  preferredName: members.preferredName,
  username: members.username,
  status: members.status,
};

const creator = alias(members, "task_creator");
const completer = alias(members, "task_completer");

function whereFor(filters: TaskFilters, nowIso: string): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (filters.chairId === "general") conds.push(isNull(tasks.chairId));
  else if (typeof filters.chairId === "number") conds.push(eq(tasks.chairId, filters.chairId));
  if (filters.assigneeId != null) {
    conds.push(inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.memberId, filters.assigneeId))));
  }
  if (filters.createdById != null) conds.push(eq(tasks.createdById, filters.createdById));
  switch (filters.status) {
    case undefined:
      break;
    case "open":
      conds.push(inArray(tasks.status, [...OPEN_STATUSES]));
      break;
    case "closed":
      conds.push(inArray(tasks.status, ["done", "cancelled"]));
      break;
    case "overdue":
      conds.push(inArray(tasks.status, [...OPEN_STATUSES]), lt(tasks.dueAt, nowIso));
      break;
    default:
      conds.push(eq(tasks.status, filters.status));
  }
  if (filters.priority) conds.push(eq(tasks.priority, filters.priority));
  if (filters.q && filters.q.trim()) {
    const needle = `%${filters.q.trim().replace(/[%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(sql`${tasks.title} like ${needle} escape '\\'`, sql`${tasks.description} like ${needle} escape '\\'`));
  }
  const defined = conds.filter((c): c is SQL => c !== undefined);
  return defined.length ? and(...defined) : undefined;
}

type RawRow = { task: Task; chair: TaskChair | null; creator: TaskPerson | null; completedBy: TaskPerson | null };

function baseQuery() {
  return db
    .select({
      task: tasks,
      chair: { id: chairs.id, name: chairs.name, slug: chairs.slug, sortOrder: chairs.sortOrder, isActive: chairs.isActive },
      creator: {
        id: creator.id,
        firstName: creator.firstName,
        lastName: creator.lastName,
        preferredName: creator.preferredName,
        username: creator.username,
        status: creator.status,
      },
      completedBy: {
        id: completer.id,
        firstName: completer.firstName,
        lastName: completer.lastName,
        preferredName: completer.preferredName,
        username: completer.username,
        status: completer.status,
      },
    })
    .from(tasks)
    .leftJoin(chairs, eq(chairs.id, tasks.chairId))
    .leftJoin(creator, eq(creator.id, tasks.createdById))
    .leftJoin(completer, eq(completer.id, tasks.completedById));
}

/** Attach assignees and checklist counts to raw rows. */
function hydrate(rows: RawRow[]): TaskListItem[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.task.id);
  const assigneeRows = db
    .select({ taskId: taskAssignees.taskId, assignedAt: taskAssignees.assignedAt, member: personColumns })
    .from(taskAssignees)
    .innerJoin(members, eq(members.id, taskAssignees.memberId))
    .where(inArray(taskAssignees.taskId, ids))
    .orderBy(asc(taskAssignees.assignedAt), asc(members.lastName), asc(members.firstName))
    .all();
  const checklistRows = db
    .select({
      taskId: taskChecklistItems.taskId,
      total: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${taskChecklistItems.isDone} then 1 else 0 end)`,
    })
    .from(taskChecklistItems)
    .where(inArray(taskChecklistItems.taskId, ids))
    .groupBy(taskChecklistItems.taskId)
    .all();
  const assigneesByTask = new Map<number, TaskPerson[]>();
  for (const a of assigneeRows) (assigneesByTask.get(a.taskId) ?? assigneesByTask.set(a.taskId, []).get(a.taskId)!).push(a.member);
  const checklistByTask = new Map(checklistRows.map((c) => [c.taskId, { done: Number(c.done ?? 0), total: Number(c.total ?? 0) }]));
  return rows.map((r) => ({
    ...r.task,
    chair: r.chair && r.chair.id != null ? r.chair : null,
    creator: r.creator && r.creator.id != null ? r.creator : null,
    completedBy: r.completedBy && r.completedBy.id != null ? r.completedBy : null,
    assignees: assigneesByTask.get(r.task.id) ?? [],
    checklist: checklistByTask.get(r.task.id) ?? { done: 0, total: 0 },
  }));
}

/** Tasks matching the filters. Default order: overdue first, then due date, priority, creation. */
export function listTasks(filters: TaskFilters = {}, now: Date = new Date()): TaskListItem[] {
  const where = whereFor(filters, now.toISOString());
  const order = filters.order ?? (filters.status === "done" || filters.status === "closed" || filters.status === "cancelled" ? "completed" : "due");
  let q = baseQuery().where(where).$dynamic();
  if (order === "completed") {
    q = q.orderBy(desc(sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt})`), desc(tasks.id));
    if (filters.limit) q = q.limit(filters.limit);
    return hydrate(q.all() as RawRow[]);
  }
  const rows = hydrate(q.all() as RawRow[]);
  const sorted = sortTasks(rows, now);
  return filters.limit ? sorted.slice(0, filters.limit) : sorted;
}

/** One task with chair, creator, assignees, checklist items and activity (oldest first). */
export function getTask(id: number): TaskDetail | null {
  const row = baseQuery().where(eq(tasks.id, id)).get() as RawRow | undefined;
  if (!row) return null;
  const [item] = hydrate([row]);
  const checklistItems = db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id))
    .orderBy(asc(taskChecklistItems.sortOrder), asc(taskChecklistItems.id))
    .all();
  const activity = db
    .select({ entry: taskActivity, member: personColumns })
    .from(taskActivity)
    .leftJoin(members, eq(members.id, taskActivity.memberId))
    .where(eq(taskActivity.taskId, id))
    .orderBy(asc(taskActivity.createdAt), asc(taskActivity.id))
    .all()
    .map((r) => ({ ...r.entry, member: r.member && r.member.id != null ? r.member : null }));
  return { ...item, checklistItems, activity };
}

/** Tasks assigned to a member. Open ones first (sorted by due), then closed ones most recent first. */
export function getTasksForMember(memberId: number, opts: { openOnly?: boolean } = {}): TaskListItem[] {
  const open = listTasks({ assigneeId: memberId, status: "open" });
  if (opts.openOnly) return open;
  const closed = listTasks({ assigneeId: memberId, status: "closed", order: "completed" });
  return [...open, ...closed];
}

export type ChairTaskCounts = { open: number; overdue: number };

/** Open and overdue counts per chair id; `null` is the General bucket. Every active chair gets an entry. */
export function getTaskCountsByChair(now: Date = new Date()): Map<number | null, ChairTaskCounts> {
  const counts = new Map<number | null, ChairTaskCounts>();
  for (const c of db.select({ id: chairs.id }).from(chairs).where(eq(chairs.isActive, true)).all()) counts.set(c.id, { open: 0, overdue: 0 });
  counts.set(null, { open: 0, overdue: 0 });
  const rows = db
    .select({ chairId: tasks.chairId, status: tasks.status, dueAt: tasks.dueAt })
    .from(tasks)
    .where(inArray(tasks.status, [...OPEN_STATUSES]))
    .all();
  for (const r of rows) {
    const entry = counts.get(r.chairId) ?? counts.set(r.chairId, { open: 0, overdue: 0 }).get(r.chairId)!;
    entry.open += 1;
    if (isOverdue(r, now)) entry.overdue += 1;
  }
  return counts;
}

/** Open tasks past their due instant, most overdue first. */
export function getOverdueTasks(now: Date = new Date()): TaskListItem[] {
  return listTasks({ status: "overdue" }, now);
}

/** Number of open tasks assigned to a member (for tab counts). */
export function countOpenTasksForMember(memberId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        inArray(tasks.status, [...OPEN_STATUSES]),
        inArray(tasks.id, db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.memberId, memberId))),
      ),
    )
    .get();
  return Number(row?.n ?? 0);
}

export function countOpenTasks(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.status, [...OPEN_STATUSES]))
    .get();
  return Number(row?.n ?? 0);
}

export type ChairSummary = TaskChair & { holders: TaskPerson[] };

/** Active chairs in sort order with their current holders (for the By chair tab and the chair select). */
export function listChairSummaries(): ChairSummary[] {
  const chairRows = db
    .select({ id: chairs.id, name: chairs.name, slug: chairs.slug, sortOrder: chairs.sortOrder, isActive: chairs.isActive })
    .from(chairs)
    .where(eq(chairs.isActive, true))
    .orderBy(asc(chairs.sortOrder), asc(chairs.name))
    .all();
  const holderRows = db
    .select({ chairId: chairHolders.chairId, member: personColumns })
    .from(chairHolders)
    .innerJoin(members, eq(members.id, chairHolders.memberId))
    .where(isNull(chairHolders.termEnd))
    .all();
  return chairRows.map((c) => ({ ...c, holders: holderRows.filter((h) => h.chairId === c.id).map((h) => h.member) }));
}

/** The chair row for an id, active or not (used for headers and permission checks). */
export function getChairById(id: number): TaskChair | null {
  return (
    db
      .select({ id: chairs.id, name: chairs.name, slug: chairs.slug, sortOrder: chairs.sortOrder, isActive: chairs.isActive })
      .from(chairs)
      .where(eq(chairs.id, id))
      .get() ?? null
  );
}

/** Member ids assigned to a task. */
export function getAssigneeIds(taskId: number): number[] {
  return db
    .select({ id: taskAssignees.memberId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId))
    .all()
    .map((r) => r.id);
}

/** Members who may be assigned: active, new members and brothers abroad, by last name. */
export function listAssignableMembers(): TaskPerson[] {
  return db
    .select(personColumns)
    .from(members)
    .where(inArray(members.status, ["active", "new_member", "abroad"]))
    .orderBy(asc(members.lastName), asc(members.firstName))
    .all();
}

/** Title lookup helper used by the pages for `?assignee=` headers. */
export function getPerson(id: number): TaskPerson | null {
  return db.select(personColumns).from(members).where(eq(members.id, id)).get() ?? null;
}
