import { MemberLink } from "@/components/member-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { markDone } from "@/lib/actions/labor";
import { formatDate, formatShortDate } from "@/lib/dates";
import type { CurrentUser } from "@/lib/permissions";
import type { GridRow, WeekGrid as WeekGridData } from "@/lib/queries/labor";
import { cn } from "@/lib/utils";
import { ActionForm } from "./action-form";
import { RowAssignForm, type PickGroup } from "./row-assign-form";
import { AssignmentStatePill } from "./state-pill";

function SlotCell({ slot, user, colSpan }: { slot: GridRow["slots"][number]; user: CurrentUser; colSpan?: number }) {
  const a = slot.assignment;
  if (!a) {
    return (
      <td colSpan={colSpan} className="px-2 py-2 align-top sm:px-3">
        <span className="text-sm text-muted">Open</span>
      </td>
    );
  }
  const mine = a.memberId === user.id;
  // Same rule as My jobs: untracked history (before labor_tracking_start) stays neutral, no Mark done.
  const canMark = mine && a.status === "assigned" && a.state !== "not_tracked";
  return (
    <td colSpan={colSpan} className={cn("px-2 py-2 align-top sm:px-3", mine && "bg-primary-soft/50")}>
      <div className="flex flex-col items-start gap-1">
        <MemberLink member={a.member} short className="text-sm leading-tight" />
        <AssignmentStatePill state={a.state} />
        {canMark ? (
          <ActionForm action={markDone} hidden={{ assignmentId: a.id }}>
            <SubmitButton size="sm" variant="primary" pendingText="Saving…" className="h-7 px-2 text-xs">
              Mark done
            </SubmitButton>
          </ActionForm>
        ) : null}
        {a.notes ? <span className="text-[11px] text-muted" title={a.notes}>{a.notes.split("\n").at(-1)}</span> : null}
      </div>
    </td>
  );
}

/** The weekly grid: job rows grouped by category, one cell per slot. */
export function WeekGrid({ grid, user, manage, groups }: { grid: WeekGridData; user: CurrentUser; manage: boolean; groups: PickGroup[] }) {
  const maxSlots = Math.max(1, ...grid.groups.flatMap((g) => g.rows.map((r) => r.slots.length)));
  const weekStart = grid.week.weekStart;
  return (
    <div className="table-wrap rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-2 py-2 font-medium sm:px-3">Job</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Window</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Due</th>
            {manage ? (
              <th className="px-2 py-2 font-medium sm:px-3">Assigned</th>
            ) : (
              Array.from({ length: maxSlots }, (_, i) => (
                <th key={i} className="px-2 py-2 font-medium sm:px-3">
                  {maxSlots > 1 ? `Brother ${i + 1}` : "Brother"}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {grid.groups.map((g) => (
            <GridGroupRows key={g.category} group={g} user={user} manage={manage} maxSlots={maxSlots} groups={groups} weekId={grid.week.id} weekStart={weekStart} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridGroupRows({
  group,
  user,
  manage,
  maxSlots,
  groups,
  weekId,
}: {
  group: WeekGridData["groups"][number];
  user: CurrentUser;
  manage: boolean;
  maxSlots: number;
  groups: PickGroup[];
  weekId: number;
  weekStart: string;
}) {
  const totalCols = 3 + (manage ? 1 : maxSlots);
  return (
    <>
      <tr className="border-t border-border bg-surface-2/60">
        <th colSpan={totalCols} scope="rowgroup" className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted sm:px-3">
          {group.label}
        </th>
      </tr>
      {group.rows.map((row) => {
        const jt = row.jobType;
        return (
          <tr key={jt.id} className="border-t border-border align-top" data-job={jt.name}>
            <td className="px-2 py-2 sm:px-3">
              <div className="font-medium leading-tight">
                {jt.name}
                {!jt.isActive ? <span className="ml-1 text-xs text-muted">(archived)</span> : null}
              </div>
              <div className="mt-0.5 text-xs text-muted md:hidden">
                {jt.windowLabel ? `${jt.windowLabel} · ` : ""}due {formatShortDate(row.dueDate)}
              </div>
              {jt.instructions ? <div className="mt-0.5 hidden max-w-xs text-xs text-muted lg:block">{jt.instructions}</div> : null}
            </td>
            <td className="hidden px-3 py-2 text-muted md:table-cell">{jt.windowLabel ?? ""}</td>
            <td className="hidden px-3 py-2 whitespace-nowrap text-muted md:table-cell">{formatDate(row.dueDate, { weekday: true })}</td>
            {manage ? (
              <td className="px-2 py-2 sm:px-3">
                <RowAssignForm
                  weekId={weekId}
                  jobTypeId={jt.id}
                  groups={groups}
                  slots={row.slots.map((s) => ({
                    slot: s.slot,
                    memberId: s.assignment?.memberId ?? null,
                    locked: !!s.assignment && (s.assignment.status !== "assigned" || !!s.assignment.completedAt || !!s.assignment.verifiedAt),
                    lockedLabel: s.assignment?.status,
                  }))}
                />
              </td>
            ) : (
              row.slots.map((s, i) => <SlotCell key={s.slot} slot={s} user={user} colSpan={i === row.slots.length - 1 ? maxSlots - row.slots.length + 1 : undefined} />)
            )}
          </tr>
        );
      })}
    </>
  );
}
