"use client";

import { useActionState } from "react";
import { createPeriod, updatePeriod } from "@/lib/actions/dues";
import { fieldValue } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, FormRow, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useCloseOnSuccess } from "./action-form";

export type PeriodFormValues = {
  id: number;
  name: string;
  amountCents: number;
  newMemberAmountCents: number | null;
  dueDate: string;
  lateFeeCents: number;
  isActive: boolean;
  notes: string | null;
};

export function PeriodForm({ period, onDone }: { period?: PeriodFormValues; onDone?: () => void }) {
  const [result, action] = useActionState(period ? updatePeriod : createPeriod, null);
  useCloseOnSuccess(result, onDone);
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const prefix = period ? `period-${period.id}` : "period-new";
  const activeDefault = result && !result.ok && result.values ? "isActive" in result.values : period ? period.isActive : true;
  return (
    <form action={action} className="space-y-3">
      {period ? <input type="hidden" name="periodId" value={period.id} /> : null}
      <Field label="Name" htmlFor={`${prefix}-name`} required hint="e.g. Fall 2026" error={errors?.name}>
        <Input id={`${prefix}-name`} name="name" required maxLength={80} autoFocus defaultValue={fieldValue(result, "name", period?.name)} />
      </Field>
      <FormRow>
        <Field label="Dues amount ($)" htmlFor={`${prefix}-amount`} required error={errors?.amount}>
          <Input id={`${prefix}-amount`} name="amount" inputMode="decimal" required placeholder="850.00" defaultValue={fieldValue(result, "amount", period ? centsToInput(period.amountCents) : "")} />
        </Field>
        <Field label="New member amount ($)" htmlFor={`${prefix}-newMemberAmount`} hint="Blank = same as dues amount" error={errors?.newMemberAmount}>
          <Input
            id={`${prefix}-newMemberAmount`}
            name="newMemberAmount"
            inputMode="decimal"
            placeholder="Same"
            defaultValue={fieldValue(result, "newMemberAmount", period?.newMemberAmountCents == null ? "" : centsToInput(period.newMemberAmountCents))}
          />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Due date" htmlFor={`${prefix}-dueDate`} required error={errors?.dueDate}>
          <Input id={`${prefix}-dueDate`} name="dueDate" type="date" required defaultValue={fieldValue(result, "dueDate", period?.dueDate)} />
        </Field>
        <Field label="Late fee ($)" htmlFor={`${prefix}-lateFee`} hint="Charged to anyone still owing after the due date" error={errors?.lateFee}>
          <Input id={`${prefix}-lateFee`} name="lateFee" inputMode="decimal" placeholder="0.00" defaultValue={fieldValue(result, "lateFee", period ? centsToInput(period.lateFeeCents) : "25.00")} />
        </Field>
      </FormRow>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isActive" defaultChecked={activeDefault} />
        Active period (shown by default; only one period is active at a time)
      </label>
      <Field label="Notes" htmlFor={`${prefix}-notes`}>
        <Textarea id={`${prefix}-notes`} name="notes" className="min-h-16" defaultValue={fieldValue(result, "notes", period?.notes)} />
      </Field>
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pendingText="Saving…">{period ? "Save period" : "Create period"}</SubmitButton>
      </div>
    </form>
  );
}
