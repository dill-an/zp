"use client";

import { useActionState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { markMissed } from "@/lib/actions/labor";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

type Props = {
  assignmentId: number;
  memberName: string;
  jobName: string;
  /** "YYYY-MM-DD" the job is due; shown in the dialog, with a warning while it is still in the future. */
  dueDate: string;
  /** Today's house-timezone date, decided on the server so the warning matches the grid's state. */
  today: string;
  fineCents: number;
};

function MissedForm({ assignmentId, memberName, jobName, dueDate, today, fineCents, close }: Props & { close: () => void }) {
  const [result, action] = useActionState(markMissed, null);
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 1500);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  const notYetDue = today < dueDate;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="text-sm">
        Mark <strong>{memberName}</strong>&apos;s <strong>{jobName}</strong> as missed?
      </p>
      <p className="text-sm text-muted" data-testid="missed-due">
        Due {formatDate(dueDate, { weekday: true, year: true })}
        {notYetDue ? "" : today === dueDate ? " (today)" : " (past due)"}
      </p>
      {notYetDue ? (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="missed-not-due">
          This job is not due until {formatDate(dueDate)}. Marking it missed now will issue a sanction before {memberName} has had the chance to do it.
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="issueSanction" defaultChecked className="mt-0.5" />
        <span>
          Issue make-up sanction and fine
          <span className="block text-xs text-muted">
            Creates an open sanction (make-up clean due in 7 days){fineCents > 0 ? ` and a ${formatCents(fineCents)} fine due in 14 days` : "; no fine is configured"}.
          </span>
        </span>
      </label>
      <FormMessage result={result} />
      <SubmitButton variant="danger" pendingText="Saving…">
        Mark missed
      </SubmitButton>
    </form>
  );
}

/**
 * "Mark missed" button with a confirm step and the sanction checkbox. `hidden` hides the trigger once the
 * job is missed while keeping the dialog mounted, so its confirmation stays visible until it closes itself.
 */
export function MarkMissedDialog({ hidden = false, ...props }: Props & { hidden?: boolean }) {
  return (
    <Dialog trigger="Mark missed" triggerVariant="outline" triggerSize="sm" triggerClassName={hidden ? "hidden" : undefined} title="Mark missed">
      {(close) => <MissedForm {...props} close={close} />}
    </Dialog>
  );
}
