import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { createWeek } from "@/lib/actions/labor";
import { addDaysISO, formatDate } from "@/lib/dates";
import { can, type CurrentUser } from "@/lib/permissions";
import { groupByPledgeClass } from "@/lib/queries/common";
import { getLaborContext, getLaborPool, getPreviousWeek, getWeekGrid, listWeeks } from "@/lib/queries/labor";
import { ActionForm } from "./action-form";
import { LaborTabs } from "./labor-tabs";
import { WeekGrid } from "./week-grid";
import { WeekManageBar } from "./week-manage";
import { WeekNav } from "./week-nav";

/** Shared body for `/labor` and `/labor/week/[weekStart]`. */
export function WeekPage({ user, weekStart, manage }: { user: CurrentUser; weekStart: string; manage: boolean }) {
  const canManage = can(user, "labor.manage");
  const manageMode = manage && canManage;
  const ctx = getLaborContext();
  const weeks = listWeeks({ includeUnpublished: canManage }).map((w) => ({ weekStart: w.weekStart, isPublished: w.isPublished }));
  const grid = getWeekGrid(weekStart);
  const isCurrent = weekStart === ctx.currentWeekStart;
  const rangeLabel = `${formatDate(weekStart, { weekday: true })} to ${formatDate(addDaysISO(weekStart, 6), { weekday: true })}`;
  const visible = grid && (grid.week.isPublished || canManage);

  const headerActions = (
    <>
      {canManage && grid ? (
        manageMode ? null : (
          <ButtonLink href={`/labor/week/${weekStart}?manage=1`} size="sm">
            Manage
          </ButtonLink>
        )
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={isCurrent ? "This week" : "Labor"}
        title={`Week of ${formatDate(weekStart, { year: true })}`}
        description={
          <span>
            {rangeLabel}
            {visible ? (
              <>
                {" · "}
                {grid.counts.filled} of {grid.counts.slots} slots filled
                {grid.counts.done ? `, ${grid.counts.done} done` : ""}
                {grid.counts.missed ? `, ${grid.counts.missed} missed` : ""}
              </>
            ) : null}
            {grid && !grid.week.isPublished ? (
              <>
                {" "}
                <StatusPill status="draft" label="Draft, not posted" />
              </>
            ) : null}
          </span>
        }
        actions={headerActions}
      />
      <LaborTabs user={user} active="/labor" />
      <div className="mb-4">
        <WeekNav weekStart={weekStart} weeks={weeks} currentWeekStart={ctx.currentWeekStart} manage={manageMode} />
      </div>

      {!grid ? (
        <NoWeek weekStart={weekStart} canManage={canManage} />
      ) : !visible ? (
        <EmptyState title="Not posted yet" description="The labor manager has not posted this week's schedule. Check back soon." />
      ) : (
        <div className="space-y-4">
          {manageMode ? <WeekManageBar grid={grid} /> : null}
          {grid.week.notes && !manageMode ? (
            <Card>
              <CardContent className="text-sm">
                <span className="font-medium">Notes: </span>
                <span className="whitespace-pre-line">{grid.week.notes}</span>
              </CardContent>
            </Card>
          ) : null}
          {grid.assignments.length === 0 && !manageMode ? (
            <EmptyState
              title="Nothing assigned yet"
              description="This week exists but no jobs have been handed out."
              action={canManage ? <ButtonLink href={`/labor/week/${weekStart}?manage=1`}>Assign jobs</ButtonLink> : undefined}
            />
          ) : (
            <WeekGrid grid={grid} user={user} manage={manageMode} groups={manageMode ? groupByPledgeClass(getLaborPool()) : []} />
          )}
          {weekStart < ctx.trackingStart ? (
            <p className="text-xs text-muted">Completion tracking started on {formatDate(ctx.trackingStart, { year: true })}; earlier weeks are shown for reference and are never overdue.</p>
          ) : null}
          <p className="text-xs text-muted">
            Your own cells are highlighted. Mark a job done from here or from <Link href="/labor/me" className="underline">My jobs</Link>, where you can also request a swap or an excuse.
          </p>
        </div>
      )}
    </>
  );
}

function NoWeek({ weekStart, canManage }: { weekStart: string; canManage: boolean }) {
  if (!canManage) {
    return <EmptyState title="Not posted yet" description={`No schedule has been posted for the week of ${formatDate(weekStart)}.`} />;
  }
  const previous = getPreviousWeek(weekStart);
  return (
    <EmptyState
      title={`No schedule for the week of ${formatDate(weekStart)} yet`}
      description={previous ? `Start from scratch, copy the week of ${formatDate(previous.weekStart)}, or let the app spread jobs by current load.` : "Start from scratch or let the app spread jobs by current load."}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <ActionForm action={createWeek} hidden={{ weekStart, mode: "empty" }}>
            <SubmitButton variant="outline" pendingText="Creating…">
              Create empty week
            </SubmitButton>
          </ActionForm>
          {previous ? (
            <ActionForm action={createWeek} hidden={{ weekStart, mode: "copy" }}>
              <SubmitButton pendingText="Copying…">Copy last week</SubmitButton>
            </ActionForm>
          ) : null}
          <ActionForm action={createWeek} hidden={{ weekStart, mode: "autofill" }}>
            <SubmitButton variant="secondary" pendingText="Filling…">
              Auto-fill
            </SubmitButton>
          </ActionForm>
        </div>
      }
    />
  );
}
