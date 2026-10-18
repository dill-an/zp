import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { markDone, undoDone } from "@/lib/actions/labor";
import { dueDescription, formatDate } from "@/lib/dates";
import type { AssignmentDetail } from "@/lib/queries/labor";
import { cn } from "@/lib/utils";
import { ActionForm } from "./action-form";
import { ExcuseDialog, SwapDialog, type Pick } from "./request-dialogs";
import { AssignmentStatePill } from "./state-pill";

/** One of my jobs: name, window, due, state and the actions I can take on it. */
export function AssignmentCard({
  a,
  brothers,
  pendingSwap,
  pendingExcuse,
  showWeek = false,
}: {
  a: AssignmentDetail;
  brothers: Pick[];
  pendingSwap?: string | null;
  pendingExcuse?: boolean;
  showWeek?: boolean;
}) {
  const open = a.status === "assigned";
  const tracked = a.state !== "not_tracked";
  const urgent = a.state === "overdue" || a.state === "due_today";
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-start sm:justify-between", urgent && "border-danger/40")} data-week={a.weekStart} data-job={a.jobType.name}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/labor/week/${a.weekStart}`} className="font-medium hover:underline">
            {a.jobType.name}
          </Link>
          <AssignmentStatePill state={a.state} />
          {pendingSwap ? <span className="text-xs text-muted">Swap: {pendingSwap}</span> : null}
          {pendingExcuse ? <span className="text-xs text-muted">Excuse requested</span> : null}
        </div>
        <p className="text-sm text-muted">
          {showWeek ? `Week of ${formatDate(a.weekStart)} · ` : ""}
          {a.jobType.windowLabel ? `${a.jobType.windowLabel} · ` : ""}
          due {formatDate(a.dueDate, { weekday: true })}
          {open && tracked ? <span className={cn("ml-1", urgent ? "font-medium text-danger" : "")}>({dueDescription(a.dueDate)})</span> : null}
          {a.completedAt ? ` · done ${formatDate(a.completedAt)}` : ""}
          {a.verifiedBy ? ` · verified by ${a.verifiedBy.preferredName}` : ""}
        </p>
        {a.jobType.instructions ? <p className="text-xs text-muted">{a.jobType.instructions}</p> : null}
        {a.notes ? <p className="text-xs text-muted whitespace-pre-line">{a.notes}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        {open ? (
          <>
            <ActionForm action={markDone} hidden={{ assignmentId: a.id }}>
              <SubmitButton size="sm" pendingText="Saving…">
                Mark done
              </SubmitButton>
            </ActionForm>
            {!pendingSwap ? <SwapDialog assignmentId={a.id} jobName={a.jobType.name} brothers={brothers} /> : null}
            {!pendingExcuse ? <ExcuseDialog assignmentId={a.id} jobName={a.jobType.name} /> : null}
          </>
        ) : null}
        {a.status === "done" && !a.verifiedAt ? (
          <ActionForm action={undoDone} hidden={{ assignmentId: a.id }}>
            <SubmitButton size="sm" variant="outline" pendingText="Saving…">
              Undo
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </li>
  );
}
