"use client";

import { useActionState } from "react";
import { createMeeting, updateMeeting } from "@/lib/actions/meetings";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { MEETING_KINDS, type MeetingKind } from "@/db/schema";
import { MEETING_KIND_LABELS } from "@/lib/queries/meetings-logic";
import { ButtonLink, Checkbox, Field, FormMessage, FormRow, Input, Select, SubmitButton, Textarea } from "@/components/ui";

export type MeetingFormValues = {
  id: number;
  title: string;
  kind: MeetingKind;
  /** datetime-local value in the house timezone. */
  scheduledAtLocal: string;
  location: string | null;
  agenda: string | null;
  isMandatory: boolean;
};

function fieldErrors(result: ActionResult | null, key: string): string[] | undefined {
  return result && !result.ok ? result.fieldErrors?.[key] : undefined;
}

export function MeetingForm({ meeting, defaultScheduledAt, defaultLocation }: { meeting?: MeetingFormValues; defaultScheduledAt?: string; defaultLocation?: string }) {
  const bound = meeting ? updateMeeting.bind(null, meeting.id) : createMeeting;
  const [result, action] = useActionState(bound, null);
  const mandatoryDefault = result && !result.ok && result.values ? result.values.isMandatory === "on" : (meeting?.isMandatory ?? true);
  // React applies a select's defaultValue only on mount, so the select is re-keyed by the value coming back from a failed submit.
  const kind = fieldValue(result, "kind", meeting?.kind ?? "house");
  return (
    <form action={action} className="space-y-4">
      <Field label="Title" htmlFor="title" required error={fieldErrors(result, "title")}>
        <Input id="title" name="title" required maxLength={120} defaultValue={fieldValue(result, "title", meeting?.title ?? "House Meeting")} />
      </Field>
      <FormRow>
        <Field label="Kind" htmlFor="kind" error={fieldErrors(result, "kind")}>
          <Select key={kind} id="kind" name="kind" defaultValue={kind}>
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEETING_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date and time" htmlFor="scheduledAt" required error={fieldErrors(result, "scheduledAt")}>
          <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required defaultValue={fieldValue(result, "scheduledAt", meeting?.scheduledAtLocal ?? defaultScheduledAt ?? "")} />
        </Field>
      </FormRow>
      <Field label="Location" htmlFor="location" error={fieldErrors(result, "location")}>
        <Input id="location" name="location" maxLength={120} defaultValue={fieldValue(result, "location", meeting?.location ?? defaultLocation ?? "")} />
      </Field>
      <Field label="Agenda" htmlFor="agenda" hint="Optional. Blank lines separate paragraphs." error={fieldErrors(result, "agenda")}>
        <Textarea id="agenda" name="agenda" rows={4} defaultValue={fieldValue(result, "agenda", meeting?.agenda ?? "")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isMandatory" defaultChecked={mandatoryDefault} />
        Mandatory (absences can be fined)
      </label>
      <FormMessage result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText={meeting ? "Saving…" : "Creating…"}>{meeting ? "Save changes" : "Create meeting"}</SubmitButton>
        <ButtonLink variant="ghost" href={meeting ? `/meetings/${meeting.id}` : "/meetings"}>
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
