"use client";

import { useActionState } from "react";
import { addCharge, updateCharge } from "@/lib/actions/dues";
import { fieldValue } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, FormRow, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MemberSelect } from "@/components/member-select";
import { CHARGE_KIND_OPTIONS } from "./constants";
import { useCloseOnSuccess } from "./action-form";
import type { MemberOption, PeriodOption } from "./payment-form";

export type ChargeFormValues = {
  id: number;
  kind: string;
  description: string;
  amountCents: number;
  dueDate: string | null;
  periodId: number | null;
};

/** Add (or edit) a charge. Negative amounts are credits. */
export function ChargeForm({
  memberId,
  members,
  periods,
  defaultPeriodId,
  defaultDueDate,
  charge,
  onDone,
}: {
  memberId?: number;
  members?: MemberOption[];
  periods: PeriodOption[];
  defaultPeriodId: number | null;
  defaultDueDate: string | null;
  charge?: ChargeFormValues;
  onDone?: () => void;
}) {
  const [result, action] = useActionState(charge ? updateCharge : addCharge, null);
  useCloseOnSuccess(result, onDone);
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const prefix = charge ? `charge-${charge.id}` : `charge-new-${memberId ?? "any"}`;
  // React applies a <select>'s defaultValue only on mount, and the form reset after a failed action restores the option
  // that was default-selected then. Keying each select on its default remounts it with what was submitted.
  const memberDefault = fieldValue(result, "memberId");
  const kindDefault = fieldValue(result, "kind", charge?.kind ?? "other");
  const periodDefault = fieldValue(result, "periodId", charge ? (charge.periodId ?? "") : (defaultPeriodId ?? ""));
  return (
    <form action={action} className="space-y-3">
      {charge ? <input type="hidden" name="chargeId" value={charge.id} /> : null}
      {memberId != null ? (
        <input type="hidden" name="memberId" value={memberId} />
      ) : (
        <Field label="Brother" htmlFor={`${prefix}-member`} required error={errors?.memberId}>
          <MemberSelect key={`member-${memberDefault}`} id={`${prefix}-member`} name="memberId" members={members ?? []} required defaultValue={memberDefault} />
        </Field>
      )}
      <FormRow>
        <Field label="Kind" htmlFor={`${prefix}-kind`} error={errors?.kind}>
          <Select key={`kind-${kindDefault}`} id={`${prefix}-kind`} name="kind" defaultValue={kindDefault}>
            {CHARGE_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount ($)" htmlFor={`${prefix}-amount`} required hint="Negative for a credit, e.g. -25" error={errors?.amount}>
          <Input id={`${prefix}-amount`} name="amount" inputMode="decimal" placeholder="0.00" required defaultValue={fieldValue(result, "amount", charge ? centsToInput(charge.amountCents) : "")} />
        </Field>
      </FormRow>
      <Field label="Description" htmlFor={`${prefix}-description`} required error={errors?.description}>
        <Input id={`${prefix}-description`} name="description" required maxLength={200} autoFocus defaultValue={fieldValue(result, "description", charge?.description)} />
      </Field>
      <FormRow>
        <Field label="Due date" htmlFor={`${prefix}-dueDate`} error={errors?.dueDate}>
          <Input id={`${prefix}-dueDate`} name="dueDate" type="date" defaultValue={fieldValue(result, "dueDate", charge ? charge.dueDate : defaultDueDate)} />
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
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pendingText="Saving…">{charge ? "Save charge" : "Add charge"}</SubmitButton>
      </div>
    </form>
  );
}
