"use client";

import { useActionState, useEffect } from "react";
import { createPledgeClass, updatePledgeClass } from "@/lib/actions/members";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import type { PledgeClass } from "@/db/schema";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, FormRow, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

function ClassForm({ pledgeClass, close }: { pledgeClass: PledgeClass | null; close: () => void }) {
  const [result, action] = useActionState(pledgeClass ? updatePledgeClass : createPledgeClass, null as ActionResult | null);
  const errors = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 400);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  return (
    <form action={action} className="space-y-4">
      {pledgeClass ? <input type="hidden" name="id" value={pledgeClass.id} /> : null}
      <FormRow>
        <Field label="Name" htmlFor="pc-name" required error={errors("name")}>
          <Input id="pc-name" name="name" required autoComplete="off" defaultValue={fieldValue(result, "name", pledgeClass?.name)} />
        </Field>
        <Field label="Sort order" htmlFor="pc-sortOrder" hint="Lower numbers are older classes." error={errors("sortOrder")}>
          <Input id="pc-sortOrder" name="sortOrder" type="number" inputMode="numeric" defaultValue={fieldValue(result, "sortOrder", pledgeClass?.sortOrder)} />
        </Field>
      </FormRow>
      <Field label="Semester" htmlFor="pc-semesterLabel" hint="e.g. Fall 2026" error={errors("semesterLabel")}>
        <Input id="pc-semesterLabel" name="semesterLabel" autoComplete="off" defaultValue={fieldValue(result, "semesterLabel", pledgeClass?.semesterLabel)} />
      </Field>
      <Field label="Notes" htmlFor="pc-notes" error={errors("notes")}>
        <Textarea id="pc-notes" name="notes" className="min-h-16" defaultValue={fieldValue(result, "notes", pledgeClass?.notes)} />
      </Field>
      <FormMessage result={result} />
      <SubmitButton pendingText="Saving…">{pledgeClass ? "Save" : "Add class"}</SubmitButton>
    </form>
  );
}

export function PledgeClassDialog({ pledgeClass }: { pledgeClass: PledgeClass | null }) {
  return (
    <Dialog
      trigger={pledgeClass ? "Edit" : "Add class"}
      triggerVariant={pledgeClass ? "outline" : "primary"}
      triggerSize="sm"
      title={pledgeClass ? `Edit ${pledgeClass.name}` : "Add pledge class"}
    >
      {(close) => <ClassForm pledgeClass={pledgeClass} close={close} />}
    </Dialog>
  );
}
