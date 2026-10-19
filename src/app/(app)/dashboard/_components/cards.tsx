import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { dueDescription, formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { bodyParagraphs, relativeAge } from "@/lib/queries/community-logic";
import type { DashboardData } from "@/lib/queries/dashboard";
import { nextWeekMessage } from "@/lib/queries/dashboard-logic";
import { statusLabel as duesStatusLabel } from "@/lib/queries/dues-logic";
import { humanize, pluralize } from "@/lib/utils";
import { CardEmpty, DashCard, SubHeading } from "./dash-card";
import { JobRow } from "./job-row";
import { TaskRow } from "./task-row";

const SANCTION_LABELS: Record<string, string> = { open: "Open", in_progress: "In progress", appealed: "Appealed" };

export function MyWeekCard({ data, laborGroup, now }: { data: DashboardData; laborGroup: string; now: Date }) {
  const { jobs, nextJobs, nextWeek, weekStart, nextWeekStart } = data;
  const inPool = laborGroup !== "none";
  return (
    <DashCard title="My week" count={jobs.length} href="/my-week" hrefLabel="Full week" testId="my-week-card">
      {!inPool && jobs.length === 0 && nextJobs.length === 0 ? (
        <CardEmpty href="/labor" linkLabel="See the weekly grid">You are not in the labor pool, so no cleans are assigned to you.</CardEmpty>
      ) : (
        <>
          {jobs.length ? (
            <ul className="divide-y divide-border" data-testid="my-week-jobs">
              {jobs.map((a) => (
                <JobRow key={a.id} a={a} compact now={now} />
              ))}
            </ul>
          ) : (
            <CardEmpty href="/labor" linkLabel="See the weekly grid">
              Nothing assigned to you for the week of {formatDate(weekStart)}.
            </CardEmpty>
          )}
          <SubHeading>Next week ({formatDate(nextWeekStart)})</SubHeading>
          {nextJobs.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="my-week-next">
              {nextJobs.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-job={a.jobType.name}>
                  <span className="font-medium">{a.jobType.name}</span>
                  <span className="text-muted">
                    {a.jobType.windowLabel ? `${a.jobType.windowLabel} · ` : ""}due {formatDate(a.dueDate, { weekday: true })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted" data-testid="my-week-next-empty">
              {nextWeekMessage(nextWeek, nextJobs.length)}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Swaps and excuses live on{" "}
            <Link href="/labor/me" className="underline">
              My jobs
            </Link>
            .
          </p>
        </>
      )}
    </DashCard>
  );
}

export function MyTasksCard({ data, now }: { data: DashboardData; now: Date }) {
  const overdue = data.tasks.filter((t) => t.bucket === "overdue").length;
  const board = data.boardTasks;
  return (
    <DashCard title="My tasks" count={data.tasks.length} href="/tasks?tab=mine" testId="my-tasks-card">
      {data.tasks.length === 0 ? (
        <CardEmpty href="/tasks" linkLabel="Browse the boards">Nothing assigned to you.</CardEmpty>
      ) : (
        <>
          {overdue ? (
            <p className="mb-1 text-xs font-medium text-danger">
              {overdue} overdue
            </p>
          ) : null}
          <ul className="divide-y divide-border" data-testid="my-tasks-list">
            {data.tasks.slice(0, 6).map((t) => (
              <TaskRow key={t.id} task={t} now={now} />
            ))}
          </ul>
          {data.tasks.length > 6 ? (
            <Link href="/tasks?tab=mine" className="mt-2 inline-block text-sm underline">
              {data.tasks.length - 6} more
            </Link>
          ) : null}
        </>
      )}
      {board.length ? (
        <section data-testid="board-tasks" aria-label="Unassigned tasks on my boards">
          <SubHeading>
            On my boards, nobody assigned <Badge tone="warning">{board.length}</Badge>
          </SubHeading>
          <ul className="divide-y divide-border">
            {board.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} now={now} board />
            ))}
          </ul>
          {board.length > 5 ? <p className="mt-1 text-xs text-muted">{pluralize(board.length - 5, "more unassigned task")} on your boards.</p> : null}
        </section>
      ) : null}
    </DashCard>
  );
}

/** Nudge to fill in phone and email; officers rely on them. Hidden once both are set. */
export function ContactNotice({ memberId, missing }: { memberId: number; missing: readonly string[] }) {
  if (missing.length === 0) return null;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 rounded-md border border-border bg-surface px-3 py-2 text-sm" data-testid="contact-notice">
      <span>Add your phone and email so officers can reach you.</span>
      <Link href={`/members/${memberId}/edit`} className="font-medium underline">
        Edit profile
      </Link>
    </p>
  );
}

export function DuesCard({ data }: { data: DashboardData }) {
  const b = data.balance;
  const headline = b.balanceCents > 0 ? "You owe" : b.balanceCents < 0 ? "Credit on your account" : b.status === "none" ? "Nothing billed yet" : "All paid up";
  return (
    <DashCard title="Dues" href="/dues" hrefLabel="My dues" testId="dues-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{headline}</p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${b.balanceCents > 0 ? (b.status === "overdue" ? "text-danger" : "") : b.balanceCents < 0 ? "text-success" : ""}`} data-testid="dues-balance">
            {formatCents(Math.abs(b.balanceCents))}
          </p>
        </div>
        <StatusPill status={b.status} label={duesStatusLabel(b.status)} />
      </div>
      <p className={`mt-2 text-sm ${b.status === "overdue" ? "font-medium text-danger" : "text-muted"}`}>
        {b.balanceCents > 0 && b.nextDueDate
          ? `Due ${formatDate(b.nextDueDate, { year: true })} (${dueDescription(b.nextDueDate)})`
          : b.balanceCents > 0
            ? "No due date set yet."
            : b.status === "none"
              ? "The treasurer has not billed you for anything."
              : "Nothing outstanding."}
      </p>
      {b.chargedCents > 0 ? (
        <p className="mt-1 text-xs text-muted">
          Charged {formatCents(b.chargedCents)} · paid {formatCents(b.paidCents)}
        </p>
      ) : null}
    </DashCard>
  );
}

export function SanctionsCard({ data }: { data: DashboardData }) {
  return (
    <DashCard title="Sanctions" count={data.sanctions.length} href="/sanctions" testId="sanctions-card">
      {data.sanctions.length === 0 ? (
        <CardEmpty>No open sanctions. Keep it that way.</CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {data.sanctions.map((s) => (
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
                {s.fineChargeCents ?? s.fineCents ? ` · fine ${formatCents(s.fineChargeCents ?? s.fineCents ?? 0)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

export function NextMeetingCard({ data }: { data: DashboardData }) {
  const next = data.nextMeeting;
  const a = data.attendance;
  const counted = a.present + a.late + a.absent;
  return (
    <DashCard title="Next meeting" href="/meetings" hrefLabel="All meetings" testId="next-meeting-card">
      {next ? (
        <div className="space-y-1">
          <Link href={`/meetings/${next.meeting.id}`} className="text-lg font-semibold hover:underline" data-testid="next-meeting-link">
            {next.meeting.title}
          </Link>
          <p className="text-sm">{formatDateTime(next.meeting.scheduledAt)}</p>
          <p className="text-sm text-muted">
            {next.meeting.location ?? "Location to be announced"}
            {next.meeting.isMandatory ? " · mandatory" : ""}
          </p>
          {next.excuse ? (
            <p className="text-sm">
              Your excuse request: <StatusPill status={next.excuse.status} />
            </p>
          ) : null}
        </div>
      ) : (
        <CardEmpty>No meeting on the calendar.</CardEmpty>
      )}
      <SubHeading>My attendance this semester</SubHeading>
      <p className="text-sm">
        <span className={`text-2xl font-semibold tabular-nums ${a.rate >= 80 ? "text-success" : a.rate >= 60 ? "text-warning" : "text-danger"}`}>{counted ? `${a.rate}%` : "n/a"}</span>
        <span className="ml-2 text-muted">
          {a.present + a.late} of {counted} counted
          {a.excused ? `, ${a.excused} excused` : ""}
        </span>
      </p>
    </DashCard>
  );
}

export function EventsCard({ data }: { data: DashboardData }) {
  return (
    <DashCard title="Events" count={data.events.length} href="/events" testId="events-card">
      {data.events.length === 0 ? (
        <CardEmpty href="/events/calendar" linkLabel="Open the calendar">Nothing coming up.</CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {data.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-event-id={e.id}>
              <div className="min-w-0">
                <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                  {e.title}
                </Link>
                <p className="text-sm text-muted">
                  {formatDateTime(e.startsAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </div>
              {e.myRsvp ? <StatusPill status={e.myRsvp} /> : e.rsvpEnabled ? <Badge>No RSVP yet</Badge> : null}
            </li>
          ))}
        </ul>
      )}
      <SubHeading>My duties</SubHeading>
      {data.duties.length === 0 ? (
        <p className="text-sm text-muted">No event duties assigned to you.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {data.duties.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <span className="font-medium">{d.label ?? humanize(d.duty)}</span>
                <span className="text-muted"> at </span>
                <Link href={`/events/${d.event.id}`} className="hover:underline">
                  {d.event.title}
                </Link>
              </span>
              <span className="text-muted">{formatDateTime(d.startsAt ?? d.event.startsAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

export function AnnouncementsCard({ data }: { data: DashboardData }) {
  return (
    <DashCard title="Announcements" href="/announcements" testId="announcements-card">
      {data.announcements.length === 0 ? (
        <CardEmpty>Nothing posted right now.</CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {data.announcements.map((a) => {
            const first = bodyParagraphs(a.body)[0]?.join(" ") ?? "";
            return (
              <li key={a.id} className="space-y-1 py-2" data-announcement-id={a.id}>
                <div className="flex flex-wrap items-center gap-2">
                  {a.isPinned ? <Badge tone="primary">Pinned</Badge> : null}
                  <span className="font-medium">{a.title}</span>
                </div>
                {first ? <p className="line-clamp-3 text-sm text-muted">{first}</p> : null}
                <p className="text-xs text-muted">
                  {a.author ? <MemberLink member={a.author} /> : "Unknown"} · {relativeAge(a.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
