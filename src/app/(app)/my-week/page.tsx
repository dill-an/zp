import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getMyWeek } from "@/lib/queries/dashboard";
import { nextWeekMessage, weekEnd } from "@/lib/queries/dashboard-logic";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { humanize } from "@/lib/utils";
import { CardEmpty, DashCard } from "../dashboard/_components/dash-card";
import { JobRow } from "../dashboard/_components/job-row";
import { TaskRow } from "../dashboard/_components/task-row";
import { WaitingCard } from "../dashboard/_components/waiting-card";

export const metadata = { title: "My week" };

const SANCTION_LABELS: Record<string, string> = { open: "Open", in_progress: "In progress", appealed: "Appealed" };

/** One page that answers "what work is assigned to me this week". */
export default async function MyWeekPage() {
  const user = await requireUser();
  const now = new Date();
  const week = getMyWeek(user, now);
  const dueTasks = week.tasks.filter((t) => t.bucket === "overdue" || t.bucket === "this_week");
  const laterTasks = week.tasks.filter((t) => t.bucket !== "overdue" && t.bucket !== "this_week");
  const laterDuties = week.duties.filter((d) => !week.dutiesThisWeek.some((x) => x.id === d.id));

  return (
    <>
      <PageHeader
        title="My week"
        description={
          <>
            {formatDate(week.weekStart, { weekday: true })} to {formatDate(weekEnd(week.weekStart), { weekday: true, year: true })} · <span data-testid="week-summary">{week.summary.label}</span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <WaitingCard items={week.waiting} className="lg:col-span-2" />
        <DashCard title="Labor jobs" count={week.jobs.length} href="/labor/me" hrefLabel="My jobs" testId="week-jobs" className="lg:col-span-2">
          {week.jobs.length === 0 ? (
            <CardEmpty href="/labor" linkLabel="See the weekly grid">
              {user.laborGroup === "none" ? "You are not in the labor pool, so no cleans are assigned to you." : "Nothing assigned to you this week."}
            </CardEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {week.jobs.map((a) => (
                <JobRow key={a.id} a={a} now={now} />
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title="Tasks" count={week.tasks.length} href="/tasks?tab=mine" hrefLabel="My tasks" testId="week-tasks">
          {week.tasks.length === 0 ? (
            <CardEmpty href="/tasks" linkLabel="Browse the boards">No open tasks assigned to you.</CardEmpty>
          ) : (
            <>
              {dueTasks.length ? (
                <ul className="divide-y divide-border">
                  {dueTasks.map((t) => (
                    <TaskRow key={t.id} task={t} now={now} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing due this week.</p>
              )}
              {laterTasks.length ? (
                <>
                  <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">Later or no due date</p>
                  <ul className="divide-y divide-border">
                    {laterTasks.map((t) => (
                      <TaskRow key={t.id} task={t} now={now} />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </DashCard>

        <DashCard title="Event duties" count={week.dutiesThisWeek.length} href="/events" hrefLabel="Events" testId="week-duties">
          {week.dutiesThisWeek.length === 0 ? (
            <CardEmpty>No event duties this week.</CardEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {week.dutiesThisWeek.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.label ?? humanize(d.duty)}</span>
                    <StatusPill status={d.status} />
                  </div>
                  <p className="text-sm text-muted">
                    <Link href={`/events/${d.event.id}`} className="hover:underline">
                      {d.event.title}
                    </Link>
                    {" · "}
                    {formatDateTime(d.startsAt ?? d.event.startsAt)}
                    {d.event.location ? ` · ${d.event.location}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {laterDuties.length ? (
            <p className="mt-2 text-xs text-muted">
              {laterDuties.length} more later:{" "}
              {laterDuties.slice(0, 3).map((d, i) => (
                <span key={d.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/events/${d.event.id}`} className="underline">
                    {d.event.title}
                  </Link>{" "}
                  ({formatDate(d.startsAt ?? d.event.startsAt)})
                </span>
              ))}
            </p>
          ) : null}
        </DashCard>

        <DashCard title="Sanctions" count={week.sanctions.length} href="/sanctions" hrefLabel="My sanctions" testId="week-sanctions">
          {week.sanctions.length === 0 ? (
            <CardEmpty>No open sanctions.</CardEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {week.sanctions.map((s) => (
                <li key={s.id} className="py-2" data-sanction-id={s.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/sanctions/${s.id}`} className="font-medium hover:underline">
                      {s.reason}
                    </Link>
                    <StatusPill status={s.status} label={SANCTION_LABELS[s.status]} />
                    {s.overdue ? <StatusPill status="overdue" label="Overdue" /> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {s.jobDescription ? `${s.jobDescription} · ` : ""}
                    {s.dueAt ? `due ${formatDateTime(s.dueAt)}` : "no due date"}
                    {s.hours ? ` · ${s.hours} ${s.hours === 1 ? "hr" : "hrs"}` : ""}
                    {s.fineChargeCents ?? s.fineCents ? ` · fine ${formatCents(s.fineChargeCents ?? s.fineCents ?? 0)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title="Meetings this week" count={week.meetings.length} href="/meetings" hrefLabel="All meetings" testId="week-meetings">
          {week.meetings.length === 0 ? (
            <CardEmpty>No meetings this week.</CardEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {week.meetings.map(({ meeting, excuse, attendance, isPast }) => (
                <li key={meeting.id} className="py-2" data-meeting-id={meeting.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/meetings/${meeting.id}`} className="font-medium hover:underline">
                      {meeting.title}
                    </Link>
                    {attendance ? <StatusPill status={attendance} /> : excuse ? <StatusPill status={excuse.status} label={`Excuse ${excuse.status}`} /> : isPast ? <span className="text-xs text-muted">Attendance not taken</span> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {formatDateTime(meeting.scheduledAt)}
                    {meeting.location ? ` · ${meeting.location}` : ""}
                    {meeting.isMandatory ? " · mandatory" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title={`Next week · ${formatDate(week.nextWeekStart)}`} count={week.nextJobs.length} href={`/labor/week/${week.nextWeekStart}`} hrefLabel="Grid" testId="week-next" className="lg:col-span-2">
          {week.nextJobs.length === 0 ? (
            <CardEmpty href={week.nextWeek.exists && week.nextWeek.isPublished ? `/labor/week/${week.nextWeekStart}` : undefined} linkLabel="See the grid">
              {nextWeekMessage(week.nextWeek, 0)}
            </CardEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {week.nextJobs.map((a) => (
                <JobRow key={a.id} a={a} compact now={now} />
              ))}
            </ul>
          )}
        </DashCard>
      </div>
    </>
  );
}
