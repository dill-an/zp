import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { getLaborContext, getLaborPool, getMemberAssignments, getMemberLaborStats, getOpenRequestsFor, type AssignmentDetail } from "@/lib/queries/labor";
import { nextWeekStart } from "@/lib/queries/labor-logic";
import { AssignmentCard } from "../_components/assignment-card";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "My jobs | Labor" };

export default async function MyLaborPage() {
  const user = await requireUser();
  const ctx = getLaborContext();
  const all = getMemberAssignments(user.id);
  const stats = getMemberLaborStats(user.id);
  const requests = getOpenRequestsFor(user.id);
  const brothers = getLaborPool()
    .filter((m) => m.id !== user.id)
    .map((m) => ({ id: m.id, name: displayName(m) }));
  const next = nextWeekStart(ctx.currentWeekStart);
  const thisWeek = all.filter((a) => a.weekStart === ctx.currentWeekStart);
  const nextWeek = all.filter((a) => a.weekStart === next);
  const later = all.filter((a) => a.weekStart > next).sort((x, y) => (x.weekStart < y.weekStart ? -1 : 1));
  const history = all.filter((a) => a.weekStart < ctx.currentWeekStart);
  const swapLabel = (a: AssignmentDetail) => {
    const s = requests.swaps.find((r) => r.assignmentId === a.id && r.requestedById === user.id);
    if (!s) return null;
    return s.status === "accepted" ? `${s.targetMember?.preferredName ?? "someone"} accepted, awaiting approval` : s.targetMember ? `waiting for ${s.targetMember.preferredName}` : "open request pending";
  };
  const excusePending = (a: AssignmentDetail) => requests.excuses.some((r) => r.assignmentId === a.id);

  const section = (title: string, items: AssignmentDetail[], empty: string, showWeek = false) => (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        {title} <span className="text-sm font-normal text-muted">({items.length})</span>
      </h2>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((a) => (
            <AssignmentCard key={a.id} a={a} brothers={brothers} pendingSwap={swapLabel(a)} pendingExcuse={excusePending(a)} showWeek={showWeek} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">{empty}</p>
      )}
    </section>
  );

  const mySwaps = requests.swaps.filter((r) => r.requestedById === user.id);
  const forMe = requests.swaps.filter((r) => r.targetMemberId === user.id && r.requestedById !== user.id && r.status === "pending");

  return (
    <>
      <PageHeader title="My jobs" description={`${displayName(user)} · ${user.laborGroup === "none" ? "not in the labor pool" : `${user.laborGroup} group`} · week of ${formatDate(ctx.currentWeekStart)}`} />
      <LaborTabs user={user} active="/labor/me" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Assigned" value={stats.assigned} hint="this semester" />
        <Stat label="Done" value={stats.done} tone="success" hint={stats.verified ? `${stats.verified} verified` : undefined} />
        <Stat label="Missed" value={stats.missed} tone={stats.missed ? "danger" : undefined} />
        <Stat label="Excused" value={stats.excused} />
        <Stat label="Points" value={stats.points} hint={stats.poolSize ? `median ${stats.medianPoints}` : undefined} tone={stats.belowMedian ? "warning" : undefined} />
      </div>

      {all.length === 0 ? (
        <EmptyState title="No jobs yet" description={user.laborGroup === "none" ? "You are not in the labor pool, so nothing is assigned to you." : "Nothing has been assigned to you yet. Check the weekly grid to see the schedule."} action={<Link href="/labor" className="text-sm underline">Open this week&apos;s grid</Link>} />
      ) : (
        <div className="space-y-6">
          {section("This week", thisWeek, "Nothing assigned to you this week.")}
          {section("Next week", nextWeek, "Nothing assigned next week yet.")}
          {later.length ? section("Later", later, "", true) : null}
          {(mySwaps.length || forMe.length || requests.excuses.length) ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Pending requests</h2>
              <ul className="space-y-1 text-sm">
                {mySwaps.map((r) => (
                  <li key={`s${r.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <span>
                      Swap {r.assignment.jobType.name} (week of {formatDate(r.assignment.weekStart)}){r.targetMember ? ` with ${displayName(r.targetMember)}` : ", open to anyone"}
                    </span>
                    <StatusPill status={r.status} label={r.status === "accepted" ? "Awaiting approval" : undefined} />
                    <Link href="/labor/swaps" className="text-xs underline">Manage</Link>
                  </li>
                ))}
                {forMe.map((r) => (
                  <li key={`t${r.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <span>
                      {displayName(r.requestedBy)} asked you to take {r.assignment.jobType.name} (week of {formatDate(r.assignment.weekStart)})
                    </span>
                    <Link href="/labor/swaps" className="text-xs underline">Respond</Link>
                  </li>
                ))}
                {requests.excuses.map((r) => (
                  <li key={`e${r.id}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <span>
                      Excuse from {r.assignment.jobType.name} (week of {formatDate(r.assignment.weekStart)})
                    </span>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {section("History", history, "No earlier weeks.", true)}
        </div>
      )}
    </>
  );
}
