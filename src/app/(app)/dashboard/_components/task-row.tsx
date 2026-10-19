import Link from "next/link";
import { ChairBadge, DueText, PriorityPill, TaskStatusPill } from "@/app/(app)/tasks/task-bits";
import { Badge } from "@/components/ui/badge";
import type { TaskWithBucket } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";

/**
 * An open task assigned to me; tasks due this week get a highlight. `board` marks a task that is
 * not assigned to anyone yet but sits on a board I run.
 */
export function TaskRow({ task, now = new Date(), board = false }: { task: TaskWithBucket; now?: Date; board?: boolean }) {
  const thisWeek = task.bucket === "this_week";
  return (
    <li className={cn("flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between", thisWeek && "rounded-md bg-primary-soft/40 px-2")} data-task-id={task.id} data-board={board ? "1" : undefined}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
            {task.title}
          </Link>
          {board ? (
            <Badge tone="warning" title="Nobody is assigned to this task yet">
              Board
            </Badge>
          ) : null}
          <TaskStatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
          {thisWeek ? <Badge tone="primary">This week</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <ChairBadge chair={task.chair} />
          <DueText task={task} now={now} />
        </div>
      </div>
    </li>
  );
}
