"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  TASK_STATUSES,
  chairs,
  members,
  taskActivity,
  taskAssignees,
  taskChecklistItems,
  tasks,
  type Task,
  type TaskStatus,
} from "@/db/schema";
import { fail, formValues, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requireUserForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { localInputToISO } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { canManageChair, type CurrentUser } from "@/lib/permissions";
import {
  canActOnTask,
  canCreateTaskForChair,
  canEditTask,
  describeStatusChange,
  diffAssignees,
  formatDueCompact,
  isOpenStatus,
  nextOccurrenceDue,
  parseChecklistText,
  parseTags,
  rejectedAssignees,
  serializeTags,
} from "@/lib/queries/tasks-logic";

/* ------------------------------------------------------------------ */
/* Helpers (not exported: a "use server" file may only export actions) */
/* ------------------------------------------------------------------ */

const idSchema = z.coerce.number().int().positive();

const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200, "Keep the title under 200 characters."),
  description: z.string().trim().max(5000, "Keep the description under 5000 characters.").optional(),
  chairId: idSchema.optional(),
  assigneeIds: z.array(idSchema).default([]),
  dueAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Pick a valid due date and time.")
    .optional(),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  recurrence: z.enum(TASK_RECURRENCES).default("none"),
  checklist: z.string().max(5000).optional(),
  tags: z.string().trim().max(500).optional(),
});

function nowIso(): string {
  return new Date().toISOString();
}

function revalidateTaskPages(taskId?: number): void {
  revalidatePath("/tasks");
  revalidatePath("/tasks/[id]", "page");
  revalidatePath("/tasks/[id]/edit", "page");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/dashboard");
  revalidatePath("/chairs", "layout");
  revalidatePath("/members", "layout");
}

function loadTask(id: number): Task | null {
  return db.select().from(tasks).where(eq(tasks.id, id)).get() ?? null;
}

function assigneeIdsOf(taskId: number): number[] {
  return db
    .select({ id: taskAssignees.memberId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId))
    .all()
    .map((r) => r.id);
}

function memberNames(ids: readonly number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: members.id, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName })
    .from(members)
    .where(inArray(members.id, [...ids]))
    .all();
  return new Map(rows.map((m) => [m.id, displayName(m)]));
}

function logActivity(taskId: number, memberId: number | null, type: (typeof taskActivity.$inferInsert)["type"], body: string): void {
  db.insert(taskActivity).values({ taskId, memberId, type, body }).run();
}

/**
 * Validate that every chosen assignee exists and may hold tasks. Returns the valid ids or an error message.
 * Ids in `keep` (already on the task) pass the status check, so an edit that leaves assignees alone still saves.
 */
function validateAssignees(ids: number[], keep: readonly number[] = []): { ids: number[] } | { error: string } {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ids: [] };
  const found = db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(inArray(members.id, unique))
    .all();
  if (found.length !== unique.length) return { error: "One of the chosen brothers does not exist." };
  if (rejectedAssignees(found, keep).length) return { error: "Tasks can only be assigned to current brothers." };
  return { ids: unique };
}

function chairNameOf(chairId: number | null): string {
  if (chairId == null) return "General";
  return db.select({ name: chairs.name }).from(chairs).where(eq(chairs.id, chairId)).get()?.name ?? "General";
}

/** Spawn the next occurrence of a recurring task that was just marked done. Returns the new task id. */
function spawnNextOccurrence(task: Task, completedAt: string, user: CurrentUser): number | null {
  const nextDue = nextOccurrenceDue(task.dueAt, completedAt, task.recurrence);
  if (!nextDue) return null;
  // Reopen + done again must not spawn a second copy: look for the marker left the first time.
  const already = db
    .select({ id: taskActivity.id })
    .from(taskActivity)
    .where(and(eq(taskActivity.taskId, task.id), eq(taskActivity.type, "status"), like(taskActivity.body, "Created the next occurrence%")))
    .get();
  if (already) return null;
  const assignees = assigneeIdsOf(task.id);
  const checklist = db
    .select({ label: taskChecklistItems.label, sortOrder: taskChecklistItems.sortOrder })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, task.id))
    .orderBy(taskChecklistItems.sortOrder, taskChecklistItems.id)
    .all();
  const created = db
    .insert(tasks)
    .values({
      title: task.title,
      description: task.description,
      chairId: task.chairId,
      createdById: task.createdById ?? user.id,
      status: "todo",
      priority: task.priority,
      dueAt: nextDue,
      recurrence: task.recurrence,
      tags: task.tags,
      sortOrder: task.sortOrder,
    })
    .returning({ id: tasks.id })
    .get();
  if (assignees.length) db.insert(taskAssignees).values(assignees.map((memberId) => ({ taskId: created.id, memberId }))).run();
  if (checklist.length) db.insert(taskChecklistItems).values(checklist.map((c) => ({ taskId: created.id, label: c.label, sortOrder: c.sortOrder }))).run();
  logActivity(created.id, user.id, "created", `Created automatically as the next occurrence of task #${task.id} (${task.recurrence}), due ${formatDueCompact(nextDue)}.`);
  logActivity(task.id, user.id, "status", `Created the next occurrence as task #${created.id}, due ${formatDueCompact(nextDue)}.`);
  logAudit({
    actorId: user.id,
    action: "task.create",
    entityType: "task",
    entityId: created.id,
    summary: `Next ${task.recurrence} occurrence of "${task.title}" created from task #${task.id}`,
  });
  return created.id;
}

/* ------------------------------------------------------------------ */
/* Create / edit / delete                                              */
/* ------------------------------------------------------------------ */

export async function createTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(taskFormSchema, formData);
    if ("result" in parsed) return parsed.result;
    const data = parsed.data;
    const chairId = data.chairId ?? null;
    if (chairId != null) {
      const chair = db.select({ id: chairs.id, isActive: chairs.isActive }).from(chairs).where(eq(chairs.id, chairId)).get();
      if (!chair || !chair.isActive) return fail("That chair does not exist.", undefined, formValues(formData));
      if (!canCreateTaskForChair(user, chairId)) {
        return fail("Only that chair's holder (or the president and VP) can add tasks to its board.", undefined, formValues(formData));
      }
    }
    const assignees = validateAssignees(data.assigneeIds);
    if ("error" in assignees) return fail(assignees.error, undefined, formValues(formData));
    const dueAt = data.dueAt ? localInputToISO(data.dueAt) : null;
    const tags = serializeTags(parseTags(data.tags));
    const checklist = parseChecklistText(data.checklist);

    const created = db
      .insert(tasks)
      .values({
        title: data.title,
        description: data.description || null,
        chairId,
        createdById: user.id,
        status: "todo",
        priority: data.priority,
        dueAt,
        recurrence: data.recurrence,
        tags,
      })
      .returning({ id: tasks.id })
      .get();
    if (assignees.ids.length) db.insert(taskAssignees).values(assignees.ids.map((memberId) => ({ taskId: created.id, memberId }))).run();
    if (checklist.length) db.insert(taskChecklistItems).values(checklist.map((label, i) => ({ taskId: created.id, label, sortOrder: i }))).run();

    const names = memberNames(assignees.ids);
    logActivity(created.id, user.id, "created", `Created the task under ${chairNameOf(chairId)}.`);
    if (assignees.ids.length) {
      logActivity(created.id, user.id, "assignment", `Assigned to ${assignees.ids.map((id) => names.get(id) ?? `#${id}`).join(", ")}.`);
    }
    logAudit({
      actorId: user.id,
      action: "task.create",
      entityType: "task",
      entityId: created.id,
      summary: `${user.username} created task "${data.title}" (${chairNameOf(chairId)})${assignees.ids.length ? ` assigned to ${[...names.values()].join(", ")}` : ""}`,
    });
    revalidateTaskPages(created.id);
    redirect(`/tasks/${created.id}`);
  });
}

export async function updateTask(taskId: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const task = loadTask(taskId);
    if (!task) return fail("Not found.");
    if (!canEditTask(user, task)) return fail("Only the creator, the chair holder or the president/VP can edit this task.");
    const parsed = parseForm(taskFormSchema, formData);
    if ("result" in parsed) return parsed.result;
    const data = parsed.data;
    const chairId = data.chairId ?? null;
    if (chairId !== task.chairId && chairId != null) {
      const chair = db.select({ id: chairs.id, isActive: chairs.isActive }).from(chairs).where(eq(chairs.id, chairId)).get();
      if (!chair || !chair.isActive) return fail("That chair does not exist.", undefined, formValues(formData));
      if (!canManageChair(user, chairId)) return fail("You can only move a task to a chair you hold.", undefined, formValues(formData));
    }
    const before = assigneeIdsOf(taskId);
    const assignees = validateAssignees(data.assigneeIds, before);
    if ("error" in assignees) return fail(assignees.error, undefined, formValues(formData));
    const dueAt = data.dueAt ? localInputToISO(data.dueAt) : null;
    const tags = serializeTags(parseTags(data.tags));

    const { added, removed } = diffAssignees(before, assignees.ids);
    db.update(tasks)
      .set({
        title: data.title,
        description: data.description || null,
        chairId,
        priority: data.priority,
        dueAt,
        recurrence: data.recurrence,
        tags,
        updatedAt: nowIso(),
      })
      .where(eq(tasks.id, taskId))
      .run();
    if (removed.length) db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.memberId, removed))).run();
    if (added.length) db.insert(taskAssignees).values(added.map((memberId) => ({ taskId, memberId }))).run();

    // Checklist: replace only when the text changed, so ticked items survive an unrelated edit.
    const existing = db
      .select({ id: taskChecklistItems.id, label: taskChecklistItems.label, isDone: taskChecklistItems.isDone })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder, taskChecklistItems.id)
      .all();
    const newLabels = parseChecklistText(data.checklist);
    const same = existing.length === newLabels.length && existing.every((e, i) => e.label === newLabels[i]);
    if (!same) {
      const doneByLabel = new Map(existing.map((e) => [e.label, e.isDone]));
      db.delete(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId)).run();
      if (newLabels.length) {
        db.insert(taskChecklistItems)
          .values(newLabels.map((label, i) => ({ taskId, label, sortOrder: i, isDone: doneByLabel.get(label) ?? false })))
          .run();
      }
    }

    const changes: string[] = [];
    if (task.title !== data.title) changes.push("title");
    if ((task.description ?? "") !== (data.description ?? "")) changes.push("description");
    if (task.chairId !== chairId) changes.push(`chair to ${chairNameOf(chairId)}`);
    if (task.priority !== data.priority) changes.push(`priority to ${data.priority}`);
    if (task.dueAt !== dueAt) changes.push(dueAt ? `due date to ${formatDueCompact(dueAt)}` : "removed the due date");
    if (task.recurrence !== data.recurrence) changes.push(`recurrence to ${data.recurrence}`);
    if ((task.tags ?? "") !== (tags ?? "")) changes.push("tags");
    if (!same) changes.push("checklist");
    if (changes.length) logActivity(taskId, user.id, "edit", `Edited ${changes.join(", ")}.`);

    if (added.length || removed.length) {
      const names = memberNames([...added, ...removed]);
      const parts: string[] = [];
      if (added.length) parts.push(`Assigned to ${added.map((id) => names.get(id) ?? `#${id}`).join(", ")}`);
      if (removed.length) parts.push(`Unassigned ${removed.map((id) => names.get(id) ?? `#${id}`).join(", ")}`);
      logActivity(taskId, user.id, "assignment", `${parts.join("; ")}.`);
      logAudit({
        actorId: user.id,
        action: "task.reassign",
        entityType: "task",
        entityId: taskId,
        summary: `${user.username} reassigned "${data.title}": ${parts.join("; ").toLowerCase()}`,
      });
    }
    logAudit({
      actorId: user.id,
      action: "task.update",
      entityType: "task",
      entityId: taskId,
      summary: `${user.username} edited task "${data.title}"${changes.length ? ` (${changes.join(", ")})` : ""}`,
    });
    revalidateTaskPages(taskId);
    redirect(`/tasks/${taskId}`);
  });
}

export async function deleteTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(z.object({ taskId: idSchema }), formData);
    if ("result" in parsed) return parsed.result;
    const task = loadTask(parsed.data.taskId);
    if (!task) return fail("Not found.");
    if (!canEditTask(user, task)) return fail("Only the creator, the chair holder or the president/VP can delete this task.");
    db.delete(tasks).where(eq(tasks.id, task.id)).run();
    logAudit({ actorId: user.id, action: "task.delete", entityType: "task", entityId: task.id, summary: `${user.username} deleted task "${task.title}"` });
    revalidateTaskPages();
    redirect("/tasks?deleted=1");
  });
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const statusSchema = z.object({ taskId: idSchema, status: z.enum(TASK_STATUSES) });

/** Start / Block / Done / Reopen / Cancel. Marking a recurring task done spawns the next occurrence. */
export async function changeTaskStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(statusSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { taskId, status } = parsed.data;
    const task = loadTask(taskId);
    if (!task) return fail("Not found.");
    if (!canActOnTask(user, task, assigneeIdsOf(taskId))) return fail("Only assignees, the creator or the chair holder can update this task.");
    if (task.status === status) return ok("No change.");
    const at = nowIso();
    const patch: Partial<Task> = { status, updatedAt: at };
    if (status === "in_progress" && !task.startedAt) patch.startedAt = at;
    if (status === "done") {
      patch.completedAt = at;
      patch.completedById = user.id;
    }
    if (isOpenStatus(status) && (task.status === "done" || task.status === "cancelled")) {
      patch.completedAt = null;
      patch.completedById = null;
      if (status === "todo") patch.startedAt = null;
    }
    db.update(tasks).set(patch).where(eq(tasks.id, taskId)).run();
    logActivity(taskId, user.id, "status", `${describeStatusChange(task.status, status)}.`);
    logAudit({
      actorId: user.id,
      action: "task.status",
      entityType: "task",
      entityId: taskId,
      summary: `${user.username} moved "${task.title}" from ${task.status} to ${status}`,
    });
    let nextId: number | null = null;
    if (status === "done" && task.recurrence !== "none") nextId = spawnNextOccurrence(task, at, user);
    revalidateTaskPages(taskId);
    if (nextId) revalidatePath(`/tasks/${nextId}`);
    const label: Record<TaskStatus, string> = {
      todo: "Task reopened.",
      in_progress: "Task started.",
      blocked: "Task marked blocked.",
      done: nextId ? `Marked done. The next occurrence was created as task #${nextId}.` : "Marked done.",
      cancelled: "Task cancelled.",
    };
    return ok(label[status], nextId ?? taskId);
  });
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

const itemSchema = z.object({ itemId: idSchema });

function loadItem(itemId: number) {
  return db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).get() ?? null;
}

export async function toggleChecklistItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(itemSchema, formData);
    if ("result" in parsed) return parsed.result;
    const item = loadItem(parsed.data.itemId);
    if (!item) return fail("Not found.");
    const task = loadTask(item.taskId);
    if (!task) return fail("Not found.");
    if (!canActOnTask(user, task, assigneeIdsOf(task.id))) return fail("Only assignees, the creator or the chair holder can tick items.");
    const isDone = !item.isDone;
    db.update(taskChecklistItems).set({ isDone }).where(eq(taskChecklistItems.id, item.id)).run();
    db.update(tasks).set({ updatedAt: nowIso() }).where(eq(tasks.id, task.id)).run();
    logActivity(task.id, user.id, "edit", `${isDone ? "Checked" : "Unchecked"} "${item.label}".`);
    revalidateTaskPages(task.id);
    return ok(isDone ? "Checked off." : "Unchecked.");
  });
}

const addItemSchema = z.object({
  taskId: idSchema,
  label: z.string().trim().min(1, "Type the item first.").max(300, "Keep items under 300 characters."),
});

export async function addChecklistItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(addItemSchema, formData);
    if ("result" in parsed) return parsed.result;
    const task = loadTask(parsed.data.taskId);
    if (!task) return fail("Not found.");
    if (!canActOnTask(user, task, assigneeIdsOf(task.id))) return fail("Only assignees, the creator or the chair holder can add items.");
    const maxRow = db
      .select({ max: taskChecklistItems.sortOrder })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, task.id))
      .orderBy(taskChecklistItems.sortOrder)
      .all();
    const sortOrder = maxRow.length ? Math.max(...maxRow.map((r) => r.max)) + 1 : 0;
    db.insert(taskChecklistItems).values({ taskId: task.id, label: parsed.data.label, sortOrder }).run();
    db.update(tasks).set({ updatedAt: nowIso() }).where(eq(tasks.id, task.id)).run();
    logActivity(task.id, user.id, "edit", `Added checklist item "${parsed.data.label}".`);
    revalidateTaskPages(task.id);
    return ok("Item added.");
  });
}

export async function deleteChecklistItem(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(itemSchema, formData);
    if ("result" in parsed) return parsed.result;
    const item = loadItem(parsed.data.itemId);
    if (!item) return fail("Not found.");
    const task = loadTask(item.taskId);
    if (!task) return fail("Not found.");
    if (!canActOnTask(user, task, assigneeIdsOf(task.id))) return fail("Only assignees, the creator or the chair holder can remove items.");
    db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, item.id)).run();
    db.update(tasks).set({ updatedAt: nowIso() }).where(eq(tasks.id, task.id)).run();
    logActivity(task.id, user.id, "edit", `Removed checklist item "${item.label}".`);
    revalidateTaskPages(task.id);
    return ok("Item removed.");
  });
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

const commentSchema = z.object({
  taskId: idSchema,
  body: z.string().trim().min(1, "Write something first.").max(4000, "Keep comments under 4000 characters."),
});

/** Anyone logged in may comment on any task. */
export async function addComment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(commentSchema, formData);
    if ("result" in parsed) return parsed.result;
    const task = loadTask(parsed.data.taskId);
    if (!task) return fail("Not found.");
    logActivity(task.id, user.id, "comment", parsed.data.body);
    db.update(tasks).set({ updatedAt: nowIso() }).where(eq(tasks.id, task.id)).run();
    revalidateTaskPages(task.id);
    return ok("Comment posted.");
  });
}
