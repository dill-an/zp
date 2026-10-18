/**
 * Cross-module sections of a member profile. Each one reads the owning module's query exports;
 * the props stay `{ memberId: number; viewer: CurrentUser }`.
 */
import Link from "next/link";
import { AssignmentStatePill } from "@/app/(app)/labor/_components/state-pill";
import { ChairBadge, DueText, TaskStatusPill } from "@/app/(app)/tasks/task-bits";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { currentWeekStart, dueDescription, formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { can, type CurrentUser } from "@/lib/permissions";
import { getMemberBalance } from "@/lib/queries/dues";
import { statusLabel as duesStatusLabel } from "@/lib/queries/dues-logic";
import { getMemberLaborStats, getMemberWeekJobs } from "@/lib/queries/labor";
import { getAttendanceSummary } from "@/lib/queries/meetings";
import { getOpenSanctionsForMember } from "@/lib/queries/sanctions";
import { getTasksForMember } from "@/lib/queries/tasks";

export type ProfileSectionProps = { memberId: number; viewer: CurrentUser };

const SANCTION_LABELS: Record<string, string> = { open: "Open", in_progress: "In progress", appealed: "Appealed" };

function Section({ title, href, linkLabel, children, testId }: { title: string; href: string; linkLabel: string; children: React.ReactNode; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        <ButtonLink href={href} variant="outline" size="sm">
          {linkLabel}
        </ButtonLink>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export async function LaborSection({ memberId }: ProfileSectionProps) {
  const weekStart = currentWeekStart();
  const stats = getMemberLaborStats(memberId);
  const jobs = getMemberWeekJobs(memberId, weekStart);
  return (
    <Section title="Labor and cleans" href={`/labor/brothers/${memberId}`} linkLabel="Full history" testId="profile-labor">
      {stats.laborGroup === "none" && stats.assigned === 0 ? (
        <Empty>Not in the labor pool.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Assigned" value={stats.assigned} hint="this semester" />
            <Stat label="Done" value={stats.done} tone="success" hint={stats.verified ? `${stats.verified} verified` : undefined} />
            <Stat label="Missed" value={stats.missed} tone={stats.missed ? "danger" : undefined} hint={stats.excused ? `${stats.excused} excused` : undefined} />
            <Stat label="Points" value={stats.points} hint={stats.poolSize ? `median ${stats.medianPoints}` : undefined} tone={stats.belowMedian ? "warning" : undefined} />
          </div>
          <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">Week of {formatDate(weekStart)}</p>
          {jobs.length === 0 ? (
            <Empty>No jobs this week.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {jobs.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm" data-job={a.jobType.name}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/labor/week/${a.weekStart}`} className="font-medium hover:underline">
                      {a.jobType.name}
                    </Link>
                    <AssignmentStatePill state={a.state} />
                  </span>
                  <span className="text-muted">
                    {a.jobType.windowLabel ? `${a.jobType.windowLabel} · ` : ""}due {formatDate(a.dueDate, { weekday: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

export async function TasksSection({ memberId }: ProfileSectionProps) {
  const tasks = getTasksForMember(memberId, { openOnly: true });
  const now = new Date();
  return (
    <Section title={`Tasks${tasks.length ? ` (${tasks.length} open)` : ""}`} href={`/tasks?assignee=${memberId}`} linkLabel="All tasks" testId="profile-tasks">
      {tasks.length === 0 ? (
        <Empty>No open tasks assigned.</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.slice(0, 8).map((t) => (
            <li key={t.id} className="flex flex-col gap-1 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between" data-task-id={t.id}>
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                  {t.title}
                </Link>
                <TaskStatusPill status={t.status} />
                <ChairBadge chair={t.chair} />
              </span>
              <DueText task={t} now={now} />
            </li>
          ))}
          {tasks.length > 8 ? (
            <li className="py-1.5 text-sm">
              <Link href={`/tasks?assignee=${memberId}`} className="underline">
                {tasks.length - 8} more
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </Section>
  );
}

export async function DuesSection({ memberId, viewer }: ProfileSectionProps) {
  const isSelf = viewer.id === memberId;
  if (!isSelf && !can(viewer, "dues.manage")) return null;
  const b = getMemberBalance(memberId);
  return (
    <Section title="Dues" href={isSelf && !can(viewer, "dues.manage") ? "/dues" : `/dues/members/${memberId}`} linkLabel="Ledger" testId="profile-dues">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{b.balanceCents > 0 ? "Balance owed" : b.balanceCents < 0 ? "Credit" : "Balance"}</p>
          <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${b.balanceCents > 0 ? (b.status === "overdue" ? "text-danger" : "") : b.balanceCents < 0 ? "text-success" : ""}`} data-testid="profile-dues-balance">
            {formatCents(Math.abs(b.balanceCents))}
          </p>
        </div>
        <StatusPill status={b.status} label={duesStatusLabel(b.status)} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Charged {formatCents(b.chargedCents)} · paid {formatCents(b.paidCents)}
        {b.balanceCents > 0 && b.nextDueDate ? ` · due ${formatDate(b.nextDueDate, { year: true })} (${dueDescription(b.nextDueDate)})` : ""}
      </p>
    </Section>
  );
}

export async function AttendanceSection({ memberId }: ProfileSectionProps) {
  const a = getAttendanceSummary(memberId);
  const counted = a.present + a.late + a.absent;
  return (
    <Section title="Meeting attendance" href={`/meetings/attendance?member=${memberId}`} linkLabel="Semester grid" testId="profile-attendance">
      {a.total === 0 ? (
        <Empty>No meetings recorded yet.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Rate" value={counted ? `${a.rate}%` : "n/a"} tone={counted ? (a.rate >= 80 ? "success" : a.rate >= 60 ? "warning" : "danger") : undefined} hint={`${a.total} recorded`} />
          <Stat label="Present" value={a.present} tone="success" />
          <Stat label="Absent" value={a.absent} tone={a.absent ? "danger" : undefined} />
          <Stat label="Excused" value={a.excused} />
          <Stat label="Late" value={a.late} tone={a.late ? "warning" : undefined} />
        </div>
      )}
    </Section>
  );
}

export async function SanctionsSection({ memberId, viewer }: ProfileSectionProps) {
  const isSelf = viewer.id === memberId;
  const manage = can(viewer, "sanctions.manage");
  if (!isSelf && !manage) return null;
  const open = getOpenSanctionsForMember(memberId);
  return (
    <Section title={`Sanctions${open.length ? ` (${open.length} open)` : ""}`} href={manage ? `/sanctions?member=${memberId}` : "/sanctions"} linkLabel="All sanctions" testId="profile-sanctions">
      {open.length === 0 ? (
        <Empty>No open sanctions.</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {open.map((s) => (
            <li key={s.id} className="py-1.5 text-sm" data-sanction-id={s.id}>
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/sanctions/${s.id}`} className="font-medium hover:underline">
                  {s.reason}
                </Link>
                <StatusPill status={s.status} label={SANCTION_LABELS[s.status]} />
                {s.overdue ? <StatusPill status="overdue" label="Overdue" /> : null}
              </span>
              <span className="text-muted">
                {s.jobDescription ? `${s.jobDescription} · ` : ""}
                {s.dueAt ? `due ${formatDateTime(s.dueAt)}` : "no due date"}
                {s.fineChargeCents ?? s.fineCents ? ` · fine ${formatCents(s.fineChargeCents ?? s.fineCents ?? 0)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
