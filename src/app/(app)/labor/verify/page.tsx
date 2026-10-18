import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberLink } from "@/components/member-link";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { SubmitButton } from "@/components/ui/submit-button";
import { markDone, markExcused, resetAssignment, verifyAllDone, verifyAssignment } from "@/lib/actions/labor";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime, weekStartFor } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { getLaborContext, getSanctionsForAssignments, getWeekGrid, listWeeks } from "@/lib/queries/labor";
import { isSunday, isValidISODate, nextWeekStart, previousWeekStart } from "@/lib/queries/labor-logic";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ActionForm } from "../_components/action-form";
import { LaborTabs } from "../_components/labor-tabs";
import { MarkMissedDialog } from "../_components/mark-missed-dialog";
import { AssignmentStatePill } from "../_components/state-pill";

export const metadata = { title: "Verify | Labor" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requirePermission("labor.manage");
  const { week: weekParam } = await searchParams;
  const ctx = getLaborContext();
  let weekStart = ctx.currentWeekStart;
  if (weekParam) {
    if (!isValidISODate(weekParam)) redirect("/labor/verify");
    if (!isSunday(weekParam)) redirect(`/labor/verify?week=${weekStartFor(weekParam)}`);
    weekStart = weekParam;
  }
  const grid = getWeekGrid(weekStart);
  const weeks = listWeeks();
  const fineCents = Number(getSetting(SETTING_KEYS.missedCleanFineCents) || 0);
  const rows = grid ? grid.assignments : [];
  const awaiting = rows.filter((a) => a.status === "done" && !a.verifiedAt);
  const verified = rows.filter((a) => a.status === "done" && a.verifiedAt);
  const open = rows.filter((a) => a.status === "assigned");
  const sanctionsByAssignment = getSanctionsForAssignments(rows.filter((a) => a.status === "missed").map((a) => a.id));

  return (
    <>
      <PageHeader
        eyebrow="Verification"
        title={`Week of ${formatDate(weekStart, { year: true })}`}
        description="Confirm what was done, mark what was missed, and issue make-up sanctions."
        actions={
          <>
            <Link href={`/labor/verify?week=${previousWeekStart(weekStart)}`} className={buttonClasses("outline", "sm")}>
              ‹ Previous week
            </Link>
            <Link href={`/labor/verify?week=${nextWeekStart(weekStart)}`} className={buttonClasses("outline", "sm")}>
              Next week ›
            </Link>
            {weekStart !== ctx.currentWeekStart ? (
              <Link href="/labor/verify" className={buttonClasses("ghost", "sm")}>
                This week
              </Link>
            ) : null}
          </>
        }
      />
      <LaborTabs user={user} active="/labor/verify" />

      {weeks.length ? (
        <div className="mb-4 flex flex-wrap gap-1 text-xs">
          {weeks.map((w) => (
            <Link key={w.id} href={`/labor/verify?week=${w.weekStart}`} className={cn("rounded-full border border-border px-2 py-0.5 hover:bg-surface-2", w.weekStart === weekStart && "bg-primary-soft text-primary-strong border-transparent")}>
              {formatDate(w.weekStart)}
            </Link>
          ))}
        </div>
      ) : null}

      {!grid ? (
        <EmptyState title="No schedule for this week" description="Create the week from the grid first." action={<ButtonLink href={`/labor/week/${weekStart}`}>Open the grid</ButtonLink>} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing assigned this week" action={<ButtonLink href={`/labor/week/${weekStart}?manage=1`}>Assign jobs</ButtonLink>} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Open" value={open.length} hint={`${open.filter((a) => a.state === "overdue").length} overdue`} />
            <Stat label="Awaiting check" value={awaiting.length} tone={awaiting.length ? "info" : undefined} />
            <Stat label="Verified" value={verified.length} tone="success" />
            <Stat label="Missed" value={grid.counts.missed} tone={grid.counts.missed ? "danger" : undefined} />
            <Stat label="Excused" value={grid.counts.excused} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm action={verifyAllDone} hidden={{ weekId: grid.week.id }} showSuccess>
              <SubmitButton size="sm" disabled={awaiting.length === 0} pendingText="Verifying…">
                Verify all done ({awaiting.length})
              </SubmitButton>
            </ActionForm>
            <ButtonLink href={`/labor/week/${weekStart}?manage=1`} variant="outline" size="sm">
              Edit assignments
            </ButtonLink>
            {weekStart < ctx.trackingStart ? <span className="text-xs text-muted">Before tracking started ({formatDate(ctx.trackingStart)}): nothing here is overdue unless you mark it.</span> : null}
          </div>

          {grid.groups.map((g) => (
            <section key={g.category} className="space-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {g.rows.flatMap((row) =>
                  row.slots
                    .filter((s) => s.assignment)
                    .map((s) => {
                      const a = s.assignment!;
                      const isVerified = a.status === "done" && !!a.verifiedAt;
                      return (
                        <li key={a.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between" data-assignment={a.id} data-job={row.jobType.name} data-member={a.member.username}>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{row.jobType.name}</span>
                              {row.slots.length > 1 ? <span className="text-xs text-muted">slot {s.slot}</span> : null}
                              <MemberLink member={a.member} short className="text-sm" />
                              <AssignmentStatePill state={a.state} />
                              {sanctionsByAssignment.get(a.id) ? (
                                <Link href={`/sanctions/${sanctionsByAssignment.get(a.id)!.id}`} className="text-xs text-danger underline" data-testid="sanction-link">
                                  Sanction issued ({sanctionsByAssignment.get(a.id)!.status})
                                </Link>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted">
                              {row.jobType.windowLabel ? `${row.jobType.windowLabel} · ` : ""}due {formatDate(row.dueDate, { weekday: true })}
                              {a.completedAt ? ` · done ${formatDateTime(a.completedAt)}` : ""}
                              {isVerified ? ` · verified by ${a.verifiedBy ? displayName(a.verifiedBy) : "a manager"} ${formatDateTime(a.verifiedAt)}` : ""}
                              {a.notes ? ` · ${a.notes.split("\n").at(-1)}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                            {a.status === "done" && !a.verifiedAt ? (
                              <ActionForm action={verifyAssignment} hidden={{ assignmentId: a.id }}>
                                <SubmitButton size="sm" pendingText="Saving…">
                                  Verify
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                            {a.status === "assigned" ? (
                              <ActionForm action={markDone} hidden={{ assignmentId: a.id }}>
                                <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                                  Mark done
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                            <MarkMissedDialog assignmentId={a.id} memberName={displayName(a.member)} jobName={row.jobType.name} fineCents={fineCents} hidden={a.status === "missed"} />
                            {a.status !== "excused" ? (
                              <ActionForm action={markExcused} hidden={{ assignmentId: a.id }}>
                                <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                                  Mark excused
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                            {a.status !== "assigned" || a.completedAt || a.verifiedAt ? (
                              <ActionForm action={resetAssignment} hidden={{ assignmentId: a.id }}>
                                <SubmitButton size="sm" variant="ghost" pendingText="Saving…">
                                  Reset to assigned
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                          </div>
                        </li>
                      );
                    }),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
