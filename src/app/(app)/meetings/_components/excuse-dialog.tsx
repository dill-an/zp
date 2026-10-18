"use client";

import { useActionState } from "react";
import { requestExcuse } from "@/lib/actions/meetings";
import { fieldValue } from "@/lib/action-result";
import { Button, Dialog, Field, FormMessage, SubmitButton, Textarea, type ButtonSize, type ButtonVariant } from "@/components/ui";

function ExcuseForm({ meetingId, close }: { meetingId: number; close: () => void }) {
  const [result, action] = useActionState(requestExcuse, null);
  if (result?.ok) {
    return (
      <div className="space-y-3">
        <FormMessage result={result} />
        <Button type="button" variant="secondary" onClick={close}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Field label="Reason" htmlFor={`excuse-reason-${meetingId}`} required hint="Exam, travel, work, illness… an officer reviews it.">
        <Textarea id={`excuse-reason-${meetingId}`} name="reason" required minLength={3} maxLength={1000} autoFocus defaultValue={fieldValue(result, "reason")} />
      </Field>
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pendingText="Sending…">Send request</SubmitButton>
      </div>
    </form>
  );
}

/** "Request excuse" button that opens a small dialog. */
export function ExcuseDialog({ meetingId, meetingLabel, variant = "outline", size = "sm", label = "Request excuse" }: {
  meetingId: number;
  meetingLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
}) {
  return (
    <Dialog trigger={label} triggerVariant={variant} triggerSize={size} title={`Request excuse: ${meetingLabel}`}>
      {(close) => <ExcuseForm meetingId={meetingId} close={close} />}
    </Dialog>
  );
}
