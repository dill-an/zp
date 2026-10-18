"use client";

import { useActionState, useEffect } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldValue } from "@/lib/action-result";
import { requestExcuse, requestSwap } from "@/lib/actions/labor";

export type Pick = { id: number; name: string };

function SwapForm({ assignmentId, jobName, brothers, close }: { assignmentId: number; jobName: string; brothers: Pick[]; close: () => void }) {
  const [result, action] = useActionState(requestSwap, null);
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 1500);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="text-sm text-muted">Ask a brother to take {jobName}, or leave it open for anyone to claim. A labor manager confirms the swap.</p>
      <Field label="Ask a specific brother" htmlFor={`swap-target-${assignmentId}`} hint="Optional. Leave blank to post an open request.">
        <Select id={`swap-target-${assignmentId}`} name="targetMemberId" defaultValue={fieldValue(result, "targetMemberId")}>
          <option value="">Anyone (open request)</option>
          {brothers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason" htmlFor={`swap-reason-${assignmentId}`}>
        <Textarea id={`swap-reason-${assignmentId}`} name="reason" rows={3} placeholder="Away this weekend, exam on Wednesday..." defaultValue={fieldValue(result, "reason")} />
      </Field>
      <FormMessage result={result} />
      <SubmitButton pendingText="Sending…">Send request</SubmitButton>
    </form>
  );
}

/** "Request swap" button plus modal form. */
export function SwapDialog({ assignmentId, jobName, brothers }: { assignmentId: number; jobName: string; brothers: Pick[] }) {
  return (
    <Dialog trigger="Request swap" triggerVariant="outline" triggerSize="sm" title={`Swap ${jobName}`}>
      {(close) => <SwapForm assignmentId={assignmentId} jobName={jobName} brothers={brothers} close={close} />}
    </Dialog>
  );
}

function ExcuseForm({ assignmentId, jobName, close }: { assignmentId: number; jobName: string; close: () => void }) {
  const [result, action] = useActionState(requestExcuse, null);
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 1500);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <p className="text-sm text-muted">Ask a labor manager to excuse you from {jobName}. Until it is approved the job is still yours.</p>
      <Field label="Reason" htmlFor={`excuse-reason-${assignmentId}`} required>
        <Textarea id={`excuse-reason-${assignmentId}`} name="reason" rows={3} required defaultValue={fieldValue(result, "reason")} />
      </Field>
      <FormMessage result={result} />
      <SubmitButton pendingText="Sending…">Request excuse</SubmitButton>
    </form>
  );
}

/** "Request excuse" button plus modal form. */
export function ExcuseDialog({ assignmentId, jobName }: { assignmentId: number; jobName: string }) {
  return (
    <Dialog trigger="Request excuse" triggerVariant="outline" triggerSize="sm" title={`Excuse from ${jobName}`}>
      {(close) => <ExcuseForm assignmentId={assignmentId} jobName={jobName} close={close} />}
    </Dialog>
  );
}
