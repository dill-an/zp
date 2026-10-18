"use client";

import { useActionState, useState } from "react";
import { createPaymentPlan } from "@/lib/actions/dues";
import { fieldValue } from "@/lib/action-result";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useCloseOnSuccess } from "./action-form";

/** A scope the plan can cover: a period (or the rows with no period) and what is owed in it right now. */
export type PlanScope = { periodId: number | null; name: string; balanceCents: number };

const ROWS = 6;

export function PlanForm({ memberId, scopes, onDone }: { memberId: number; scopes: PlanScope[]; onDone?: () => void }) {
  const [result, action] = useActionState(createPaymentPlan, null);
  useCloseOnSuccess(result, onDone);
  const owing = scopes.filter((s) => s.balanceCents > 0);
  // The select stays uncontrolled: the form reset after a failed action would wipe a controlled value. Keying it on the
  // last submitted scope remounts it with that scope as the default, which the reset then keeps.
  const scopeDefault = fieldValue(result, "periodId", owing[0]?.periodId ?? "");
  const [scopeKey, setScopeKey] = useState<string>(scopeDefault);
  const selected = scopes.find((s) => String(s.periodId ?? "") === scopeKey) ?? owing[0];
  if (owing.length === 0) {
    return <p className="text-sm text-muted">This brother has nothing outstanding, so there is nothing to put on a plan.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="memberId" value={memberId} />
      <Field label="Period" htmlFor="plan-period" hint={selected ? `Installments must add up to ${formatCents(selected.balanceCents)}.` : undefined}>
        <Select key={`scope-${scopeDefault}`} id="plan-period" name="periodId" defaultValue={scopeDefault} onChange={(e) => setScopeKey(e.target.value)}>
          {owing.map((s) => (
            <option key={s.periodId ?? "none"} value={s.periodId ?? ""}>
              {s.name} ({formatCents(s.balanceCents)} owed)
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Installments (3 to 6)</p>
        {Array.from({ length: ROWS }, (_, i) => i + 1).map((n) => (
          <div key={n} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
            <span className="text-sm text-muted">{n}.</span>
            <Input name={`due_${n}`} type="date" aria-label={`Installment ${n} date`} defaultValue={fieldValue(result, `due_${n}`)} />
            <Input name={`amount_${n}`} inputMode="decimal" placeholder="$" aria-label={`Installment ${n} amount`} defaultValue={fieldValue(result, `amount_${n}`)} />
          </div>
        ))}
      </div>
      <Field label="Notes" htmlFor="plan-notes">
        <Textarea id="plan-notes" name="notes" className="min-h-16" defaultValue={fieldValue(result, "notes")} />
      </Field>
      <FormMessage result={result} />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pendingText="Saving…">Propose plan</SubmitButton>
      </div>
    </form>
  );
}
