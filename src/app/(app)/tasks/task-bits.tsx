import Link from "next/link";
import { CalendarClock, CircleAlert, ListChecks, Repeat } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/dates";
import { displayName, initials, shortName } from "@/lib/names";
import { RECURRENCE_LABELS, TASK_STATUS_LABELS, dueLabel, formatDueCompact, isOverdue } from "@/lib/queries/tasks-logic";
import type { TaskChair, TaskPerson } from "@/lib/queries/tasks";
import type { TaskPriority, TaskRecurrence, TaskStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Chair name as a badge linking to the chair page; "General" for tasks without a chair. */
export function ChairBadge({ chair, className }: { chair: TaskChair | null; className?: string }) {
  if (!chair) {
    return (
      <Badge tone="neutral" className={className}>
        General
      </Badge>
    );
  }
  return (
    <Link href={`/chairs/${chair.slug}`} className={cn("inline-flex", className)} title={`${chair.name} task board`}>
      <Badge tone="primary" className="hover:underline">
        {chair.name}
      </Badge>
    </Link>
  );
}

/** Status pill with the module's labels ("To do" rather than "Todo"). */
export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return <StatusPill status={status} label={TASK_STATUS_LABELS[status]} className={className} />;
}

/** Priority pill, shown only when it matters (high or urgent). */
export function PriorityPill({ priority, always = false }: { priority: TaskPriority; always?: boolean }) {
  if (!always && priority !== "high" && priority !== "urgent") return null;
  return <StatusPill status={priority} />;
}

/** Stacked avatars plus short names. "Unassigned" when nobody owns the task. */
export function AssigneeList({ people, max = 4, size = "sm", className }: { people: TaskPerson[]; max?: number; size?: "sm" | "md"; className?: string }) {
  if (people.length === 0) return <span className={cn("text-sm text-muted", className)}>Unassigned</span>;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {shown.map((p) => (
        <Link key={p.id} href={`/members/${p.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline" title={displayName(p)}>
          <Avatar initials={initials(p)} seed={p.id} size={size} />
          <span>{shortName(p)}</span>
        </Link>
      ))}
      {extra > 0 ? <span className="text-xs text-muted">+{extra} more</span> : null}
    </span>
  );
}

/** Due date with the relative label; red when overdue, muted when there is no due date. */
export function DueText({
  task,
  now = new Date(),
  className,
  withIcon = false,
}: {
  task: { status: TaskStatus; dueAt: string | null };
  now?: Date;
  className?: string;
  withIcon?: boolean;
}) {
  if (!task.dueAt) return <span className={cn("text-sm text-muted", className)}>No due date</span>;
  const overdue = isOverdue(task, now);
  const closed = task.status === "done" || task.status === "cancelled";
  const rel = closed ? "" : dueLabel(task.dueAt, now);
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", overdue ? "font-semibold text-danger" : closed ? "text-muted" : "", className)}>
      {withIcon ? overdue ? <CircleAlert className="h-3.5 w-3.5" aria-hidden /> : <CalendarClock className="h-3.5 w-3.5 text-muted" aria-hidden /> : null}
      <span className="whitespace-nowrap">{formatDueCompact(task.dueAt, now)}</span>
      {rel ? <span className={cn("whitespace-nowrap text-xs", overdue ? "" : "text-muted")}>({rel})</span> : null}
    </span>
  );
}

/** "Done by Gio, Oct 18 at 4:12 PM". */
export function CompletedText({ task, className }: { task: { completedAt: string | null; completedBy: TaskPerson | null; status: TaskStatus }; className?: string }) {
  if (!task.completedAt) return <span className={cn("text-sm text-muted", className)}>{task.status === "cancelled" ? "Cancelled" : ""}</span>;
  return (
    <span className={cn("text-sm", className)}>
      <span className="text-muted">{task.status === "cancelled" ? "Cancelled" : "Done"} by </span>
      {task.completedBy ? (
        <Link href={`/members/${task.completedBy.id}`} className="font-medium hover:underline">
          {shortName(task.completedBy)}
        </Link>
      ) : (
        <span className="font-medium">someone</span>
      )}
      <span className="text-muted">, {formatDateTime(task.completedAt)}</span>
    </span>
  );
}

/** "2/4" checklist progress; hidden when there is no checklist. */
export function ChecklistCount({ done, total, className }: { done: number; total: number; className?: string }) {
  if (total === 0) return null;
  const complete = done === total;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", complete ? "text-success" : "text-muted", className)} title="Checklist progress">
      <ListChecks className="h-3.5 w-3.5" aria-hidden />
      {done}/{total}
    </span>
  );
}

export function RecurrenceText({ recurrence, className }: { recurrence: TaskRecurrence; className?: string }) {
  if (recurrence === "none") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted", className)} title={RECURRENCE_LABELS[recurrence]}>
      <Repeat className="h-3.5 w-3.5" aria-hidden />
      {recurrence === "weekly" ? "Weekly" : recurrence === "biweekly" ? "Every 2 weeks" : "Monthly"}
    </span>
  );
}

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((t) => (
        <Badge key={t} tone="neutral">
          #{t}
        </Badge>
      ))}
    </span>
  );
}
