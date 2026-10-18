"use client";

import { useActionState } from "react";
import { saveHouseSettings } from "@/lib/actions/settings";
import { fieldValue } from "@/lib/action-result";
import { WEEKDAY_OPTIONS, type HouseSettingsForm as Values } from "@/lib/queries/dashboard-logic";
import { Field, FormMessage, FormRow, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function HouseSettingsForm({ current }: { current: Values }) {
  const [result, action] = useActionState(saveHouseSettings, null);
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const value = (key: keyof Values) => fieldValue(result, key, current[key]);
  return (
    <form action={action} className="space-y-4" data-testid="house-settings-form">
      <FormRow>
        <Field label="Organization" htmlFor="orgName" error={errors?.orgName} required>
          <Input id="orgName" name="orgName" defaultValue={value("orgName")} required />
        </Field>
        <Field label="Chapter or house name" htmlFor="chapterName" hint="Shown in the app header." error={errors?.chapterName} required>
          <Input id="chapterName" name="chapterName" defaultValue={value("chapterName")} required />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Semester label" htmlFor="semesterLabel" hint="For example Fall 2026." error={errors?.semesterLabel} required>
          <Input id="semesterLabel" name="semesterLabel" defaultValue={value("semesterLabel")} required />
        </Field>
        <Field label="Labor tracking start" htmlFor="laborTrackingStart" hint="Jobs in weeks before this date are never counted as overdue." error={errors?.laborTrackingStart} required>
          <Input id="laborTrackingStart" name="laborTrackingStart" type="date" defaultValue={value("laborTrackingStart")} required />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Venmo handle" htmlFor="venmoHandle" hint="Shown to brothers on the Dues page as the place to pay." error={errors?.venmoHandle}>
          <Input id="venmoHandle" name="venmoHandle" placeholder="zp-treasurer" autoCapitalize="none" defaultValue={value("venmoHandle")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="House meeting day" htmlFor="houseMeetingDay" error={errors?.houseMeetingDay} required>
            <Select id="houseMeetingDay" name="houseMeetingDay" defaultValue={value("houseMeetingDay")}>
              {WEEKDAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Meeting time" htmlFor="houseMeetingTime" error={errors?.houseMeetingTime} required>
            <Input id="houseMeetingTime" name="houseMeetingTime" type="time" defaultValue={value("houseMeetingTime")} required />
          </Field>
        </div>
      </FormRow>
      <FormRow>
        <Field label="Missed clean fine (dollars)" htmlFor="missedCleanFine" hint="Charged when a clean is marked missed." error={errors?.missedCleanFine} required>
          <Input id="missedCleanFine" name="missedCleanFine" inputMode="decimal" defaultValue={value("missedCleanFine")} required />
        </Field>
        <Field label="Missed meeting fine (dollars)" htmlFor="missedMeetingFine" hint="Charged for an unexcused absence." error={errors?.missedMeetingFine} required>
          <Input id="missedMeetingFine" name="missedMeetingFine" inputMode="decimal" defaultValue={value("missedMeetingFine")} required />
        </Field>
      </FormRow>
      <FormMessage result={result} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save house settings</SubmitButton>
      </div>
    </form>
  );
}
