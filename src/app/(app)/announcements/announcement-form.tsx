"use client";

import { useActionState } from "react";
import { ButtonLink, Checkbox, Field, FormMessage, FormRow, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { fieldValue, type ActionResult } from "@/lib/action-result";

export type AnnouncementFormValues = {
  title: string;
  body: string;
  audience: string;
  isPinned: boolean;
  /** "YYYY-MM-DD" or "". */
  expiresAt: string;
};

function wasChecked(result: ActionResult | null, key: string, fallback: boolean): boolean {
  if (result && !result.ok && result.values) return key in result.values;
  return fallback;
}

export function AnnouncementForm({
  action,
  audiences,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  audiences: { value: string; label: string }[];
  initial?: AnnouncementFormValues | null;
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
      <Field label="Body" htmlFor="body" required error={errors.body} hint="Blank lines start new paragraphs.">
        <Textarea id="body" name="body" required rows={8} maxLength={10000} defaultValue={fieldValue(result, "body", initial?.body)} />
      </Field>
      <FormRow>
        <Field label="Audience" htmlFor="audience" required error={errors.audience}>
          <Select id="audience" name="audience" defaultValue={fieldValue(result, "audience", initial?.audience ?? "all")}>
            {audiences.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expires" htmlFor="expiresAt" error={errors.expiresAt} hint="Hidden after this day. Optional.">
          <Input id="expiresAt" name="expiresAt" type="date" defaultValue={fieldValue(result, "expiresAt", initial?.expiresAt)} />
        </Field>
      </FormRow>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox id="isPinned" name="isPinned" defaultChecked={wasChecked(result, "isPinned", initial?.isPinned ?? false)} />
        Pin to the top
      </label>
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
