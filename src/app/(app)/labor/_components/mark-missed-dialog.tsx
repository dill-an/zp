"use client";

import { useActionState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { markMissed } from "@/lib/actions/labor";
import { formatCents } from "@/lib/money";

function MissedForm({ assignmentId, memberName, jobName, fineCents, close }: { assignmentId: number; memberName: string; jobName: string; fineCents: number; close: () => void }) {
  const [result, action] = useActionState(markMissed, null);
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 1500);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="text-sm">
        Mark <strong>{memberName}</strong>&apos;s <strong>{jobName}</strong> as missed?
      </p>
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
export function MarkMissedDialog({ assignmentId, memberName, jobName, fineCents, hidden = false }: { assignmentId: number; memberName: string; jobName: string; fineCents: number; hidden?: boolean }) {
  return (
    <Dialog trigger="Mark missed" triggerVariant="outline" triggerSize="sm" triggerClassName={hidden ? "hidden" : undefined} title="Mark missed">
      {(close) => <MissedForm assignmentId={assignmentId} memberName={memberName} jobName={jobName} fineCents={fineCents} close={close} />}
    </Dialog>
  );
}
