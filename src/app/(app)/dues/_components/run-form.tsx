"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormAction } from "./action-form";

/** Confirm step for a billing or late-fee run: one button that posts the period id. */
export function RunForm({
  action,
  periodId,
  label,
  pendingText,
  disabled,
  cancelHref,
}: {
  action: FormAction;
  periodId: number;
  label: string;
  pendingText: string;
  disabled?: boolean;
  cancelHref: string;
}) {
  const [result, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="periodId" value={periodId} />
      <FormMessage result={result} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText={pendingText} disabled={disabled} data-testid="run-confirm">
          {label}
        </SubmitButton>
        <ButtonLink href={cancelHref} variant="outline">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
