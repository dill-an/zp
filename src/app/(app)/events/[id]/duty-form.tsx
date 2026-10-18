"use client";

import { useActionState } from "react";
import { Field, FormMessage, FormRow, Input, Select, SubmitButton } from "@/components/ui";
import { MemberSelect } from "@/components/member-select";
import { addEventDuty } from "@/lib/actions/community";
import { fieldValue } from "@/lib/action-result";
import { humanize } from "@/lib/utils";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

export function DutyForm({
  eventId,
  groups,
  dutyKinds,
  defaultStart,
  defaultEnd,
}: {
  eventId: number;
  groups: { label: string; members: M[] }[];
  dutyKinds: readonly string[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [result, action] = useActionState(addEventDuty.bind(null, eventId), null);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-3">
      <FormRow>
        <Field label="Brother" htmlFor="dutyMemberId" error={errors.memberId} hint="Leave empty to fill later.">
          <MemberSelect id="dutyMemberId" name="memberId" groups={groups} placeholder="Unassigned" defaultValue={fieldValue(result, "memberId")} />
        </Field>
        <Field label="Duty" htmlFor="duty" required error={errors.duty}>
          <Select id="duty" name="duty" defaultValue={fieldValue(result, "duty", "sober_monitor")}>
            {dutyKinds.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <Field label="Label" htmlFor="label" error={errors.label} hint="e.g. Front door, first shift.">
        <Input id="label" name="label" maxLength={200} defaultValue={fieldValue(result, "label")} />
      </Field>
      <FormRow>
        <Field label="Starts" htmlFor="dutyStartsAt" error={errors.startsAt}>
          <Input id="dutyStartsAt" name="startsAt" type="datetime-local" defaultValue={fieldValue(result, "startsAt", defaultStart)} />
        </Field>
        <Field label="Ends" htmlFor="dutyEndsAt" error={errors.endsAt}>
          <Input id="dutyEndsAt" name="endsAt" type="datetime-local" defaultValue={fieldValue(result, "endsAt", defaultEnd)} />
        </Field>
      </FormRow>
      <FormMessage result={result} />
      <SubmitButton size="sm" pendingText="Adding…">
        Save duty
      </SubmitButton>
    </form>
  );
}
