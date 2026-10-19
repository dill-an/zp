import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { requireUser } from "@/lib/auth";
import { dueDescription, formatDate } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { can } from "@/lib/permissions";
import { getMember } from "@/lib/queries/common";
import { getLaborContext, getMemberAssignments, getMemberLaborStats, type AssignmentDetail } from "@/lib/queries/labor";
import { cn } from "@/lib/utils";
import { LaborTabs } from "../../_components/labor-tabs";
import { AssignmentStatePill } from "../../_components/state-pill";

export async function generateMetadata({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const m = /^\d+$/.test(memberId) ? getMember(Number(memberId)) : null;
  return { title: m ? `${displayName(m)} | Labor` : "Labor" };
}

export default async function BrotherLaborPage({ params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  const { memberId } = await params;
  if (!/^\d+$/.test(memberId)) notFound();
  const member = getMember(Number(memberId));
  if (!member) notFound();
  const ctx = getLaborContext();
  const stats = getMemberLaborStats(member.id);
  const all = getMemberAssignments(member.id, { includeUnpublished: can(user, "labor.manage") });
  const byWeek = new Map<string, AssignmentDetail[]>();
  for (const a of all) (byWeek.get(a.weekStart) ?? byWeek.set(a.weekStart, []).get(a.weekStart)!).push(a);
  const weeks = [...byWeek.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <>
      <PageHeader
        eyebrow="Labor history"
        title={displayName(member)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill status={member.laborGroup} />
            {member.pledgeClass ? <span>{member.pledgeClass.name}</span> : null}
            {stats.rank ? <span>· rank {stats.rank} of {stats.poolSize} by points</span> : null}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/members/${member.id}`} variant="outline" size="sm">
              Profile
            </ButtonLink>
            {member.id === user.id ? (
              <ButtonLink href="/labor/me" size="sm">
                My jobs
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <LaborTabs user={user} active="/labor/brothers" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Assigned" value={stats.assigned} />
        <Stat label="Done" value={stats.done} tone="success" hint={stats.verified ? `${stats.verified} verified` : undefined} />
        <Stat label="Missed" value={stats.missed} tone={stats.missed ? "danger" : undefined} />
        <Stat label="Excused" value={stats.excused} />
        <Stat label="Points" value={stats.points} hint={`median ${stats.medianPoints}`} tone={stats.belowMedian ? "warning" : undefined} />
      </div>

      {weeks.length === 0 ? (
        <EmptyState title="No jobs yet" description={`${member.preferredName} has not been assigned any labor.`} action={<Link href="/labor/brothers" className="text-sm underline">Back to all brothers</Link>} />
      ) : (
        <ol className="space-y-3">
          {weeks.map((ws) => {
            const jobs = byWeek.get(ws)!;
            const current = ws === ctx.currentWeekStart;
            return (
              <li key={ws} className={cn("rounded-lg border border-border bg-surface", current && "border-primary/50")}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <Link href={`/labor/week/${ws}`} className="font-medium hover:underline">
                    Week of {formatDate(ws, { year: true })}
                  </Link>
                  <span className="text-xs text-muted">
                    {current ? "this week · " : ""}
                    {jobs.length} job{jobs.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {jobs.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="font-medium">{a.jobType.name}</span>
                      <span className="text-muted">
                        {a.jobType.windowLabel ? `${a.jobType.windowLabel} · ` : ""}due {formatDate(a.dueDate, { weekday: true })}
                        {a.status === "assigned" && a.state !== "not_tracked" ? ` · (${dueDescription(a.dueDate)})` : ""}
                      </span>
                      <AssignmentStatePill state={a.state} />
                      {a.verifiedBy ? <span className="text-xs text-muted">verified by {a.verifiedBy.preferredName}</span> : null}
                      {a.notes ? <span className="basis-full text-xs text-muted whitespace-pre-line">{a.notes}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
