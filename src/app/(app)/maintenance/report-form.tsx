"use client";

import { useActionState } from "react";
import { Field, FormMessage, FormRow, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { createMaintenanceRequest, updateMaintenanceRequest } from "@/lib/actions/community";
import { fieldValue } from "@/lib/action-result";
import { humanize } from "@/lib/utils";

export type MaintenanceFormValues = { title: string; description: string; location: string; priority: string };

/** Report a new issue, or edit an existing one when `requestId` is given. */
export function MaintenanceForm({
  requestId,
  priorities,
  initial,
  submitLabel = "Report",
}: {
  requestId?: number;
  priorities: readonly string[];
  initial?: MaintenanceFormValues | null;
  submitLabel?: string;
}) {
  const action = requestId == null ? createMaintenanceRequest : updateMaintenanceRequest.bind(null, requestId);
  const [result, formAction] = useActionState(action, null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const prefix = requestId == null ? "report" : "edit";
  return (
    <form action={formAction} className="space-y-4">
      <Field label="What is wrong?" htmlFor={`${prefix}-title`} required error={errors.title}>
        <Input id={`${prefix}-title`} name="title" required maxLength={200} placeholder="e.g. Second floor shower drains slowly" defaultValue={fieldValue(result, "title", initial?.title)} autoFocus={!initial} />
      </Field>
      <FormRow>
        <Field label="Where" htmlFor={`${prefix}-location`} error={errors.location}>
          <Input id={`${prefix}-location`} name="location" maxLength={200} placeholder="e.g. 2nd floor bathroom" defaultValue={fieldValue(result, "location", initial?.location)} />
        </Field>
        <Field label="Priority" htmlFor={`${prefix}-priority`} required error={errors.priority}>
          <Select id={`${prefix}-priority`} name="priority" defaultValue={fieldValue(result, "priority", initial?.priority ?? "normal")}>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <Field label="Details" htmlFor={`${prefix}-description`} error={errors.description} hint="When it started, what you tried, anything the fixer should know.">
        <Textarea id={`${prefix}-description`} name="description" rows={4} maxLength={5000} defaultValue={fieldValue(result, "description", initial?.description)} />
      </Field>
      <FormMessage result={result} />
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
