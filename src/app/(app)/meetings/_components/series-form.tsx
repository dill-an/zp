"use client";

import { useActionState } from "react";
import { createMeetingSeries } from "@/lib/actions/meetings";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { MEETING_KINDS } from "@/db/schema";
import { dayName } from "@/lib/dates";
import { MEETING_KIND_LABELS } from "@/lib/queries/meetings-logic";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, SubmitButton } from "@/components/ui";

function fieldErrors(result: ActionResult | null, key: string): string[] | undefined {
  return result && !result.ok ? result.fieldErrors?.[key] : undefined;
}

export function SeriesForm({ defaultWeekday, defaultTime, defaultFirstDate, defaultLastDate, defaultLocation }: {
  defaultWeekday: number;
  defaultTime: string;
  defaultFirstDate: string;
  defaultLastDate: string;
  defaultLocation?: string;
}) {
  const [result, action] = useActionState(createMeetingSeries, null);
  const mandatoryDefault = result && !result.ok && result.values ? result.values.isMandatory === "on" : true;
  // React applies a select's defaultValue only on mount, so the selects are re-keyed by the value coming back from a failed submit.
  const kind = fieldValue(result, "kind", "house");
  const weekday = fieldValue(result, "weekday", defaultWeekday);
  return (
    <form action={action} className="space-y-4">
      <FormRow>
        <Field label="Title" htmlFor="series-title" required error={fieldErrors(result, "title")}>
          <Input id="series-title" name="title" required maxLength={120} defaultValue={fieldValue(result, "title", "House Meeting")} />
        </Field>
        <Field label="Kind" htmlFor="series-kind" error={fieldErrors(result, "kind")}>
          <Select key={kind} id="series-kind" name="kind" defaultValue={kind}>
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEETING_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Weekday" htmlFor="series-weekday" error={fieldErrors(result, "weekday")}>
          <Select key={weekday} id="series-weekday" name="weekday" defaultValue={weekday}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time" htmlFor="series-time" required error={fieldErrors(result, "time")}>
          <Input id="series-time" name="time" type="time" required defaultValue={fieldValue(result, "time", defaultTime)} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="First date" htmlFor="series-first" required hint="The first meeting is the first matching weekday on or after this date." error={fieldErrors(result, "firstDate")}>
          <Input id="series-first" name="firstDate" type="date" required defaultValue={fieldValue(result, "firstDate", defaultFirstDate)} />
        </Field>
        <Field label="Last date" htmlFor="series-last" required error={fieldErrors(result, "lastDate")}>
          <Input id="series-last" name="lastDate" type="date" required defaultValue={fieldValue(result, "lastDate", defaultLastDate)} />
        </Field>
      </FormRow>
      <Field label="Location" htmlFor="series-location" error={fieldErrors(result, "location")}>
        <Input id="series-location" name="location" maxLength={120} defaultValue={fieldValue(result, "location", defaultLocation ?? "")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isMandatory" defaultChecked={mandatoryDefault} />
        Mandatory
      </label>
      <p className="text-xs text-muted">Dates that already have a meeting of this kind are skipped, so re-running the series is safe.</p>
      <FormMessage result={result} />
      <SubmitButton variant="secondary" pendingText="Creating…">
        Create series
      </SubmitButton>
    </form>
  );
}
