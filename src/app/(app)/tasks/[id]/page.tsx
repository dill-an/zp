import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { initials } from "@/lib/names";
import { getTask, type TaskActivityEntry } from "@/lib/queries/tasks";
import { RECURRENCE_LABELS, canActOnTask, canEditTask, checklistProgress, isOverdue, splitTags } from "@/lib/queries/tasks-logic";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { MemberLink } from "@/components/member-link";
import { humanize } from "@/lib/utils";
import { AssigneeList, ChairBadge, DueText, PriorityPill, TagList } from "../task-bits";
import { Checklist } from "./checklist";
import { CommentForm } from "./comment-form";
import { DeleteTaskButton } from "./delete-button";
import { StatusActions } from "./status-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = /^\d+$/.test(id) ? getTask(Number(id)) : null;
  return { title: task ? task.title : "Task" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const task = getTask(Number(id));
  if (!task) notFound();

  const now = new Date();
  const assigneeIds = task.assignees.map((a) => a.id);
  const canAct = canActOnTask(user, task, assigneeIds);
  const canEdit = canEditTask(user, task);
  const overdue = isOverdue(task, now);
  const progress = checklistProgress(task.checklistItems);
  const tags = splitTags(task.tags);
  const isMine = assigneeIds.includes(user.id);

  return (
    <>
      <PageHeaderBlock
        back={task.chair ? `/tasks?tab=chair&chair=${task.chair.id}` : "/tasks"}
        backLabel={task.chair ? `${task.chair.name} board` : "Tasks"}
        title={task.title}
        status={task.status}
        overdue={overdue}
        actions={
          canEdit ? (
            <>
              <ButtonLink href={`/tasks/${task.id}/edit`} variant="secondary">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </ButtonLink>
              <DeleteTaskButton taskId={task.id} title={task.title} />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Status and ownership: first on phones, right column on desktop. */}
        <div className="space-y-4 lg:order-last">
          <Card data-testid="task-status-card">
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={task.status} className="text-sm" />
                <PriorityPill priority={task.priority} />
                {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                {isMine ? <Badge tone="info">Assigned to you</Badge> : null}
              </div>
              <dl className="space-y-2 text-sm">
                <Row label="Due">
                  <DueText task={task} now={now} />
                </Row>
                {task.startedAt ? <Row label="Started">{formatDateTime(task.startedAt)}</Row> : null}
                {task.completedAt ? (
                  <Row label={task.status === "cancelled" ? "Cancelled" : "Done"}>
                    {formatDateTime(task.completedAt)}
                    {task.completedBy ? (
                      <>
                        {" "}
                        by <MemberLink member={task.completedBy} short />
                      </>
                    ) : null}
                  </Row>
                ) : null}
              </dl>
              {canAct ? (
                <StatusActions taskId={task.id} status={task.status} />
              ) : (
                <p className="text-xs text-muted">Only the assignees, the creator and the chair holder can change this task&apos;s status.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">People</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Assigned to</p>
                <AssigneeList people={task.assignees} max={10} size="md" className="gap-y-2" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Created by</p>
                {task.creator ? <MemberLink member={task.creator} withAvatar /> : <span className="text-muted">Unknown</span>}
                <span className="block text-xs text-muted">{formatDateTime(task.createdAt, { year: true })}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Row label="Chair">
                  <ChairBadge chair={task.chair} />
                </Row>
                <Row label="Priority">{humanize(task.priority)}</Row>
                <Row label="Repeats">{RECURRENCE_LABELS[task.recurrence]}</Row>
                {tags.length ? (
                  <Row label="Tags">
                    <TagList tags={tags} />
                  </Row>
                ) : null}
                <Row label="Task id">#{task.id}</Row>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {task.description ? (
            <Card>
              <CardContent className="py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="items-center">
              <CardTitle className="text-sm">
                Checklist
                {progress.total > 0 ? (
                  <span className={progress.complete ? "ml-2 text-xs font-medium text-success" : "ml-2 text-xs font-medium text-muted"} data-testid="checklist-progress">
                    {progress.label} done
                  </span>
                ) : null}
              </CardTitle>
              {progress.total > 0 ? (
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className={progress.complete ? "h-full bg-success" : "h-full bg-primary"} style={{ width: `${progress.percent}%` }} />
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <Checklist taskId={task.id} items={task.checklistItems} canAct={canAct} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.activity.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : null}
              <ol className="space-y-3" data-testid="activity">
                {task.activity.map((a) => (
                  <ActivityItem key={a.id} entry={a} />
                ))}
              </ol>
              <div className="border-t border-border pt-3">
                <CommentForm taskId={task.id} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function PageHeaderBlock({
  back,
  backLabel,
  title,
  status,
  overdue,
  actions,
}: {
  back: string;
  backLabel: string;
  title: string;
  status: string;
  overdue: boolean;
  actions: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          <Link href={back} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> {backLabel}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          {humanize(status)}
          {overdue ? <span className="font-semibold text-danger"> and overdue</span> : null}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

const ACTIVITY_TONES: Record<TaskActivityEntry["type"], "neutral" | "info" | "success" | "warning" | "primary"> = {
  comment: "neutral",
  status: "success",
  assignment: "info",
  edit: "warning",
  created: "primary",
};

function ActivityItem({ entry }: { entry: TaskActivityEntry }) {
  const isComment = entry.type === "comment";
  return (
    <li className="flex gap-3" data-activity-type={entry.type}>
      {entry.member ? <Avatar initials={initials(entry.member)} seed={entry.member.id} size="sm" className="mt-0.5" /> : <Avatar initials="?" size="sm" className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {entry.member ? <MemberLink member={entry.member} className="text-text" /> : <span className="font-medium text-text">System</span>}
          {!isComment ? (
            <Badge tone={ACTIVITY_TONES[entry.type]} className="text-[10px]">
              {entry.type === "created" ? "created" : entry.type}
            </Badge>
          ) : null}
          <span>{formatDateTime(entry.createdAt)}</span>
        </p>
        <p className={isComment ? "mt-0.5 whitespace-pre-wrap text-sm" : "mt-0.5 text-sm text-muted"}>{entry.body}</p>
      </div>
    </li>
  );
}
