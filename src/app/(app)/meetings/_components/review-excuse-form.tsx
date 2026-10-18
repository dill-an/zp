"use client";

import { useActionState } from "react";
import { reviewExcuse } from "@/lib/actions/meetings";
import { fieldValue } from "@/lib/action-result";
import { FormMessage, Input, SubmitButton } from "@/components/ui";

export function ReviewExcuseForm({ requestId }: { requestId: number }) {
  const bound = reviewExcuse.bind(null, requestId);
  const [result, action] = useActionState(bound, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input name="note" placeholder="Note (optional)" maxLength={500} className="h-9 sm:w-56" aria-label="Review note" defaultValue={fieldValue(result, "note")} />
      <div className="flex gap-2">
        <SubmitButton size="sm" name="decision" value="approve" pendingText="Saving…">
          Approve
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="deny" pendingText="Saving…">
          Deny
        </SubmitButton>
      </div>
      <FormMessage result={result} className="py-1" />
    </form>
  );
}
