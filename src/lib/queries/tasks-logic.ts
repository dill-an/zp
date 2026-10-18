/**
 * Pure task logic shared by the tasks queries, actions and pages. No database access here.
 * Unit tested in tasks-logic.test.ts.
 */
import type { TaskPriority, TaskRecurrence, TaskStatus } from "@/db/schema";
import { APP_TIMEZONE, addDaysISO, dueDescription, isoToLocalInput, localInputToISO } from "@/lib/dates";
import { canManageChair, type CurrentUser } from "@/lib/permissions";

/** Statuses that count as "still to do". */
export const OPEN_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked"] as const;

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Lower sorts first. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const RECURRENCE_DAYS: Record<Exclude<TaskRecurrence, "none">, number> = { weekly: 7, biweekly: 14, monthly: 30 };

/** Display labels; `humanize("todo")` would give "Todo". */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none: "Does not repeat",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every 30 days",
};

export type TaskLike = {
  status: TaskStatus;
  dueAt: string | null;
  priority: TaskPriority;
  createdAt: string;
};

/** Open and past its due instant. Done or cancelled tasks are never overdue. */
export function isOverdue(task: Pick<TaskLike, "status" | "dueAt">, now: Date = new Date()): boolean {
  if (!task.dueAt || !isOpenStatus(task.status)) return false;
  const due = Date.parse(task.dueAt);
  return !Number.isNaN(due) && due < now.getTime();
}

/** Overdue first, then due date ascending (no due date last), then priority, then creation order. Returns a new array. */
export function sortTasks<T extends TaskLike>(tasks: readonly T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const overdue = Number(!isOverdue(a, now)) - Number(!isOverdue(b, now));
    if (overdue !== 0) return overdue;
    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    const priority = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (priority !== 0) return priority;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/**
 * Due instant for the next occurrence of a recurring task.
 * Base is the previous due date (or the completion instant when the task had none) plus the interval,
 * keeping the same wall-clock time in the house timezone across DST changes. When the task was finished
 * so late that the next slot is already behind the completion instant, keep stepping forward so the new
 * occurrence is never born overdue. Returns null for non-recurring tasks.
 */
export function nextOccurrenceDue(dueAt: string | null, completedAt: string, recurrence: TaskRecurrence): string | null {
  if (recurrence === "none") return null;
  const days = RECURRENCE_DAYS[recurrence];
  if (!days) return null;
  const base = dueAt ?? completedAt;
  const local = isoToLocalInput(base);
  if (!local) return null;
  const [datePart, timePart] = local.split("T");
  const completedMs = Date.parse(completedAt);
  let date = addDaysISO(datePart, days);
  let next = localInputToISO(`${date}T${timePart}`);
  // Guard against stepping forever on bad input: 1000 intervals is far more than any realistic lateness.
  for (let i = 0; i < 1000 && next && dueAt && Date.parse(next) <= completedMs; i++) {
    date = addDaysISO(date, days);
    next = localInputToISO(`${date}T${timePart}`);
  }
  return next;
}

export type ChecklistProgress = { done: number; total: number; label: string; percent: number; complete: boolean };

/** "2/4" style progress for a checklist. An empty checklist is not "complete". */
export function checklistProgress(items: readonly { isDone: boolean }[]): ChecklistProgress {
  const total = items.length;
  const done = items.filter((i) => i.isDone).length;
  return {
    done,
    total,
    label: `${done}/${total}`,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done === total,
  };
}

export type TaskOwnership = { createdById: number | null; chairId: number | null };

/** Assignees, the creator, chair managers and `tasks.manage_all` may change status, tick checklist items and comment-manage. */
export function canActOnTask(user: CurrentUser | null | undefined, task: TaskOwnership, assigneeIds: readonly number[]): boolean {
  if (!user) return false;
  if (assigneeIds.includes(user.id)) return true;
  return canEditTask(user, task);
}

/** The creator, chair managers and `tasks.manage_all` may edit, reassign and delete. */
export function canEditTask(user: CurrentUser | null | undefined, task: TaskOwnership): boolean {
  if (!user) return false;
  if (task.createdById === user.id) return true;
  return canManageChair(user, task.chairId);
}

/** Anyone may create a General task; a task under a chair needs that chair's manager (or tasks.manage_all). */
export function canCreateTaskForChair(user: CurrentUser | null | undefined, chairId: number | null): boolean {
  if (!user) return false;
  if (chairId == null) return true;
  return canManageChair(user, chairId);
}

export type StatusAction = { status: TaskStatus; label: string; variant: "primary" | "secondary" | "outline" | "danger" | "ghost" };

/** Buttons offered from a given status, in display order. */
export function statusActions(status: TaskStatus): StatusAction[] {
  switch (status) {
    case "todo":
      return [
        { status: "in_progress", label: "Start", variant: "secondary" },
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "blocked", label: "Block", variant: "outline" },
        { status: "cancelled", label: "Cancel task", variant: "ghost" },
      ];
    case "in_progress":
      return [
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "blocked", label: "Block", variant: "outline" },
        { status: "todo", label: "Back to to-do", variant: "ghost" },
        { status: "cancelled", label: "Cancel task", variant: "ghost" },
      ];
    case "blocked":
      return [
        { status: "in_progress", label: "Unblock and start", variant: "secondary" },
        { status: "done", label: "Mark done", variant: "primary" },
        { status: "todo", label: "Back to to-do", variant: "ghost" },
        { status: "cancelled", label: "Cancel task", variant: "ghost" },
      ];
    case "done":
    case "cancelled":
      return [{ status: "todo", label: "Reopen", variant: "secondary" }];
  }
}

/** One checklist item per non-empty line; leading "- " or "* " bullets and "[ ]" boxes are stripped. */
export function parseChecklistText(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]\s*)?(?:\[[ xX]?\]\s*)?/, "").trim())
    .filter((line) => line.length > 0);
}

/** Comma separated tags, trimmed, lower-cased, de-duplicated, in input order. */
export function parseTags(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Tags are stored as a comma separated string in `tasks.tags`. */
export function serializeTags(tags: readonly string[]): string | null {
  return tags.length ? tags.join(", ") : null;
}

export function splitTags(stored: string | null | undefined): string[] {
  return parseTags(stored);
}

/**
 * Relative due label in the house timezone: "due today", "2 days overdue", "due in 5 days".
 * `dueDescription` in the shared helpers slices the UTC date out of an ISO instant, which is off by one
 * for anything due late in the evening (23:59 New York is 03:59Z the next day), so convert first.
 */
export function dueLabel(dueAt: string | null | undefined, now: Date = new Date()): string {
  if (!dueAt) return "";
  const local = isoToLocalInput(dueAt);
  return dueDescription(local ? local.slice(0, 10) : dueAt.slice(0, 10), now);
}

/** "Oct 18" or "Oct 18, 2027" when outside the current year; appends the time unless it is end of day (23:59). */
export function formatDueCompact(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = yearIn(d) === yearIn(now);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
  const local = isoToLocalInput(iso);
  const time = local.slice(11, 16);
  if (time === "23:59" || time === "00:00") return datePart;
  const timePart = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(d);
  return `${datePart}, ${timePart}`;
}

function yearIn(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, year: "numeric" }).format(d);
}

/** Human summary of a status transition for the activity feed. */
export function describeStatusChange(from: TaskStatus, to: TaskStatus): string {
  const names: Record<TaskStatus, string> = { todo: "to-do", in_progress: "in progress", blocked: "blocked", done: "done", cancelled: "cancelled" };
  if (to === "done") return "Marked done";
  if (to === "cancelled") return "Cancelled the task";
  if (to === "in_progress" && from === "blocked") return "Unblocked and started";
  if (to === "in_progress") return "Started";
  if (to === "blocked") return "Marked blocked";
  if (to === "todo" && (from === "done" || from === "cancelled")) return "Reopened";
  return `Moved from ${names[from]} to ${names[to]}`;
}

/**
 * Ids among `found` that may not receive a new assignment (inactive or alumni). Ids in `keep`, the ones
 * already on the task, stay allowed so an unrelated edit does not have to drop them first.
 */
export function rejectedAssignees(found: readonly { id: number; status: string }[], keep: readonly number[] = []): number[] {
  const kept = new Set(keep);
  return found.filter((m) => !kept.has(m.id) && (m.status === "inactive" || m.status === "alumni")).map((m) => m.id);
}

/** Which assignee ids were added and removed between two assignment lists. */
export function diffAssignees(before: readonly number[], after: readonly number[]): { added: number[]; removed: number[] } {
  const b = new Set(before);
  const a = new Set(after);
  return { added: [...a].filter((id) => !b.has(id)), removed: [...b].filter((id) => !a.has(id)) };
}
