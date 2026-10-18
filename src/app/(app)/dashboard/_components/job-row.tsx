import Link from "next/link";
import { ActionForm } from "@/app/(app)/labor/_components/action-form";
import { AssignmentStatePill } from "@/app/(app)/labor/_components/state-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { markDone } from "@/lib/actions/labor";
import { dueDescription, formatDate } from "@/lib/dates";
import type { AssignmentDetail } from "@/lib/queries/labor";
import { cn } from "@/lib/utils";

/**
 * One labor job on the dashboard or My week: job, window, due day, state and Mark done
 * (the labor module's own server action, so it behaves exactly like My jobs).
 */
export function JobRow({ a, showWeek = false, compact = false }: { a: AssignmentDetail; showWeek?: boolean; compact?: boolean }) {
  const open = a.status === "assigned";
  const tracked = a.state !== "not_tracked";
  const canAct = open && tracked;
  const urgent = a.state === "overdue" || a.state === "due_today";
  return (
    <li className={cn("flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between", urgent && "rounded-md bg-danger-soft/40 px-2")} data-job={a.jobType.name} data-week={a.weekStart}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/labor/week/${a.weekStart}`} className="font-medium hover:underline">
            {a.jobType.name}
          </Link>
          <AssignmentStatePill state={a.state} />
        </div>
        <p className="text-sm text-muted">
          {showWeek ? `Week of ${formatDate(a.weekStart)} · ` : ""}
          {a.jobType.windowLabel ? `${a.jobType.windowLabel} · ` : ""}
          due {formatDate(a.dueDate, { weekday: true })}
          {canAct ? <span className={cn("ml-1", urgent && "font-medium text-danger")}>({dueDescription(a.dueDate)})</span> : null}
          {a.completedAt ? ` · done ${formatDate(a.completedAt)}` : ""}
        </p>
        {!compact && a.jobType.instructions ? <p className="text-xs text-muted">{a.jobType.instructions}</p> : null}
      </div>
      {canAct ? (
        <ActionForm action={markDone} hidden={{ assignmentId: a.id }} className="sm:shrink-0">
          <SubmitButton size="sm" pendingText="Saving…">
            Mark done
          </SubmitButton>
        </ActionForm>
      ) : null}
    </li>
  );
}
