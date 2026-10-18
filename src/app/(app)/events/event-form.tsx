"use client";

import { useActionState } from "react";
import { ButtonLink, Checkbox, Field, FormMessage, FormRow, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { humanize } from "@/lib/utils";

export type EventFormValues = {
  title: string;
  kind: string;
  /** datetime-local values in the house timezone. */
  startsAt: string;
  endsAt: string;
  location: string;
  description: string;
  chairId: string;
  isMandatory: boolean;
  rsvpEnabled: boolean;
  /** Dollars as typed, e.g. "250.00". */
  budget: string;
};

/** After a failed submit, a checkbox is checked only if it was sent. */
function wasChecked(result: ActionResult | null, key: string, fallback: boolean): boolean {
  if (result && !result.ok && result.values) return key in result.values;
  return fallback;
}

export function EventForm({
  action,
  kinds,
  chairs,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  kinds: readonly string[];
  chairs: { id: number; name: string }[];
  initial?: EventFormValues | null;
  submitLabel: string;
  cancelHref: string;
}) {
  const [result, formAction] = useActionState(action, null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Title" htmlFor="title" required error={errors.title}>
        <Input id="title" name="title" required maxLength={200} defaultValue={fieldValue(result, "title", initial?.title)} autoFocus={!initial} />
      </Field>
      <FormRow>
        <Field label="Kind" htmlFor="kind" required error={errors.kind}>
          <Select id="kind" name="kind" defaultValue={fieldValue(result, "kind", initial?.kind ?? "social")}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owning chair" htmlFor="chairId" error={errors.chairId} hint="Who is running it.">
          <Select id="chairId" name="chairId" defaultValue={fieldValue(result, "chairId", initial?.chairId)}>
            <option value="">No chair</option>
            {chairs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Starts" htmlFor="startsAt" required error={errors.startsAt}>
          <Input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={fieldValue(result, "startsAt", initial?.startsAt)} />
        </Field>
        <Field label="Ends" htmlFor="endsAt" error={errors.endsAt} hint="Optional.">
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={fieldValue(result, "endsAt", initial?.endsAt)} />
        </Field>
      </FormRow>
      <Field label="Location" htmlFor="location" error={errors.location}>
        <Input id="location" name="location" maxLength={200} placeholder="e.g. House, Kresge Oval" defaultValue={fieldValue(result, "location", initial?.location)} />
      </Field>
      <Field label="Description" htmlFor="description" error={errors.description} hint="What, why, what to bring. Blank lines start new paragraphs.">
        <Textarea id="description" name="description" rows={5} maxLength={5000} defaultValue={fieldValue(result, "description", initial?.description)} />
      </Field>
      <FormRow>
        <Field label="Budget" htmlFor="budget" error={errors.budget} hint="Dollars, optional.">
          <Input id="budget" name="budget" inputMode="decimal" placeholder="0.00" defaultValue={fieldValue(result, "budget", initial?.budget)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox id="isMandatory" name="isMandatory" defaultChecked={wasChecked(result, "isMandatory", initial?.isMandatory ?? false)} />
            Attendance is mandatory
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox id="rsvpEnabled" name="rsvpEnabled" defaultChecked={wasChecked(result, "rsvpEnabled", initial?.rsvpEnabled ?? true)} />
            Collect RSVPs
          </label>
        </div>
      </FormRow>
      <FormMessage result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
