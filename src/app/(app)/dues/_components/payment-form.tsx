"use client";

import { useActionState } from "react";
import { recordPayment, updatePayment } from "@/lib/actions/dues";
import { fieldValue } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MemberSelect } from "@/components/member-select";
import { PAYMENT_METHOD_OPTIONS } from "./constants";
import { useCloseOnSuccess } from "./action-form";

export type PeriodOption = { id: number; name: string };
export type MemberOption = { id: number; firstName: string; lastName: string; preferredName: string };

export type PaymentFormValues = {
  id: number;
  amountCents: number;
  method: string;
  /** "YYYY-MM-DD" */
  paidOn: string;
  periodId: number | null;
  reference: string | null;
  notes: string | null;
};

/** Record (or edit) a payment. Pass `memberId` to fix the brother, or `members` to pick one. */
export function PaymentForm({
  memberId,
  members,
  periods,
  defaultPeriodId,
  today,
  payment,
  onDone,
}: {
  memberId?: number;
  members?: MemberOption[];
  periods: PeriodOption[];
  defaultPeriodId: number | null;
  today: string;
  payment?: PaymentFormValues;
  onDone?: () => void;
}) {
  const [result, action] = useActionState(payment ? updatePayment : recordPayment, null);
  useCloseOnSuccess(result, onDone);
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const prefix = payment ? `payment-${payment.id}` : `payment-new-${memberId ?? "any"}`;
  // React applies a <select>'s defaultValue only on mount, and the form reset after a failed action restores the option
  // that was default-selected then. Keying each select on its default remounts it with what was submitted.
  const memberDefault = fieldValue(result, "memberId");
  const methodDefault = fieldValue(result, "method", payment?.method ?? "venmo");
  const periodDefault = fieldValue(result, "periodId", payment ? (payment.periodId ?? "") : (defaultPeriodId ?? ""));
  return (
    <form action={action} className="space-y-3">
      {payment ? <input type="hidden" name="paymentId" value={payment.id} /> : null}
      {memberId != null ? (
        <input type="hidden" name="memberId" value={memberId} />
      ) : (
        <Field label="Brother" htmlFor={`${prefix}-member`} required error={errors?.memberId}>
          <MemberSelect key={`member-${memberDefault}`} id={`${prefix}-member`} name="memberId" members={members ?? []} required defaultValue={memberDefault} />
        </Field>
      )}
      <FormRow>
        <Field label="Amount ($)" htmlFor={`${prefix}-amount`} required error={errors?.amount}>
          <Input
            id={`${prefix}-amount`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            autoFocus
            defaultValue={fieldValue(result, "amount", payment ? centsToInput(payment.amountCents) : "")}
          />
        </Field>
        <Field label="Method" htmlFor={`${prefix}-method`} error={errors?.method}>
          <Select key={`method-${methodDefault}`} id={`${prefix}-method`} name="method" defaultValue={methodDefault}>
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Date paid" htmlFor={`${prefix}-paidAt`} required error={errors?.paidAt}>
          <Input id={`${prefix}-paidAt`} name="paidAt" type="date" required defaultValue={fieldValue(result, "paidAt", payment?.paidOn ?? today)} />
        </Field>
        <Field label="Period" htmlFor={`${prefix}-period`} error={errors?.periodId}>
          <Select key={`period-${periodDefault}`} id={`${prefix}-period`} name="periodId" defaultValue={periodDefault}>
            <option value="">No period</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <Field label="Reference" htmlFor={`${prefix}-reference`} hint="Venmo note, check number, confirmation code">
        <Input id={`${prefix}-reference`} name="reference" defaultValue={fieldValue(result, "reference", payment?.reference)} />
      </Field>
      <Field label="Notes" htmlFor={`${prefix}-notes`}>
        <Textarea id={`${prefix}-notes`} name="notes" className="min-h-16" defaultValue={fieldValue(result, "notes", payment?.notes)} />
      </Field>
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pendingText="Saving…">{payment ? "Save payment" : "Record payment"}</SubmitButton>
      </div>
    </form>
  );
}
