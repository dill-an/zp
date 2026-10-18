import Link from "next/link";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import type { TaskListItem } from "@/lib/queries/tasks";
import { isOpenStatus, splitTags } from "@/lib/queries/tasks-logic";
import { cn } from "@/lib/utils";
import { AssigneeList, ChairBadge, ChecklistCount, CompletedText, DueText, PriorityPill, RecurrenceText, TagList, TaskStatusPill } from "./task-bits";
import { QuickDoneButton } from "./quick-done-button";

export type TaskListProps = {
  tasks: TaskListItem[];
  /** Task ids the current user may mark done from the list. */
  actionableIds: Set<number>;
  /** "open" shows due dates; "done" shows who finished the task and when. */
  variant?: "open" | "done";
  /** Hide the chair badge (when the list is already grouped by chair). */
  hideChair?: boolean;
  now?: Date;
};

/** Responsive task list: cards on phones, a table from md up. */
export function TaskList({ tasks, actionableIds, variant = "open", hideChair = false, now = new Date() }: TaskListProps) {
  return (
    <>
      <ul className="space-y-2 md:hidden" data-testid="task-cards">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} canAct={actionableIds.has(t.id)} variant={variant} hideChair={hideChair} now={now} />
        ))}
      </ul>
      <div className="hidden md:block" data-testid="task-table">
        <Table>
          <THead>
            <tr>
              <Th>Task</Th>
              <Th>Who</Th>
              <Th>{variant === "done" ? "Finished" : "Due"}</Th>
              <Th>Status</Th>
              <Th className="w-px" />
            </tr>
          </THead>
          <TBody>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} canAct={actionableIds.has(t.id)} variant={variant} hideChair={hideChair} now={now} />
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

type ItemProps = { task: TaskListItem; canAct: boolean; variant: "open" | "done"; hideChair: boolean; now: Date };

function Meta({ task, hideChair }: { task: TaskListItem; hideChair: boolean }) {
  const tags = splitTags(task.tags);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {hideChair ? null : <ChairBadge chair={task.chair} />}
      <PriorityPill priority={task.priority} />
      <ChecklistCount done={task.checklist.done} total={task.checklist.total} />
      <RecurrenceText recurrence={task.recurrence} />
      {tags.length ? <TagList tags={tags.slice(0, 3)} /> : null}
    </span>
  );
}

function TaskRow({ task, canAct, variant, hideChair, now }: ItemProps) {
  const open = isOpenStatus(task.status);
  return (
    <Tr data-task-id={task.id}>
      <Td className="max-w-md">
        <Link href={`/tasks/${task.id}`} className={cn("font-medium hover:underline", !open && "text-muted")}>
          {task.title}
        </Link>
        <div className="mt-1">
          <Meta task={task} hideChair={hideChair} />
        </div>
      </Td>
      <Td>
        <AssigneeList people={task.assignees} />
      </Td>
      <Td>{variant === "done" ? <CompletedText task={task} /> : <DueText task={task} now={now} />}</Td>
      <Td>
        <TaskStatusPill status={task.status} />
      </Td>
      <Td className="text-right">{open && canAct ? <QuickDoneButton taskId={task.id} title={task.title} /> : null}</Td>
    </Tr>
  );
}

function TaskCard({ task, canAct, variant, hideChair, now }: ItemProps) {
  const open = isOpenStatus(task.status);
  return (
    <li className="rounded-lg border border-border bg-surface p-3 shadow-sm" data-task-id={task.id}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/tasks/${task.id}`} className={cn("font-medium leading-snug hover:underline", !open && "text-muted")}>
          {task.title}
        </Link>
        <TaskStatusPill status={task.status} className="shrink-0" />
      </div>
      <div className="mt-1.5">
        <Meta task={task} hideChair={hideChair} />
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <AssigneeList people={task.assignees} max={3} />
          <div>{variant === "done" ? <CompletedText task={task} /> : <DueText task={task} now={now} withIcon />}</div>
        </div>
        {open && canAct ? <QuickDoneButton taskId={task.id} title={task.title} /> : null}
      </div>
    </li>
  );
}
