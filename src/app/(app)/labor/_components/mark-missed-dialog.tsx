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

/** "Mark missed" button with a confirm step and the sanction checkbox. */
export function MarkMissedDialog({ assignmentId, memberName, jobName, fineCents }: { assignmentId: number; memberName: string; jobName: string; fineCents: number }) {
  return (
    <Dialog trigger="Mark missed" triggerVariant="outline" triggerSize="sm" title="Mark missed">
      {(close) => <MissedForm assignmentId={assignmentId} memberName={memberName} jobName={jobName} fineCents={fineCents} close={close} />}
    </Dialog>
  );
}
