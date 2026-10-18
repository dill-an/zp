"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { fieldValue } from "@/lib/action-result";
import { saveJobType } from "@/lib/actions/labor";
import { JOB_CATEGORIES, JOB_KINDS, type JobType } from "@/db/schema";
import { humanize } from "@/lib/utils";

const DAYS = ["Sun (week start)", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun (next)", "Mon (next)", "Tue (next)", "Wed (next)", "Thu (next)", "Fri (next)", "Sat (next)", "Sun (two weeks)"];

/** Create or edit a job type. */
export function JobTypeForm({ jobType }: { jobType?: JobType | null }) {
  const [result, action] = useActionState(saveJobType, null);
  const fe = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);
  const checked = (key: string, fallback: boolean) => {
    if (result && !result.ok && result.values) return key in result.values;
    return fallback;
  };
  return (
    <form action={action} className="space-y-4">
      {jobType ? <input type="hidden" name="id" value={jobType.id} /> : null}
      <FormRow>
        <Field label="Name" htmlFor="jt-name" required error={fe("name")}>
          <Input id="jt-name" name="name" required maxLength={80} defaultValue={fieldValue(result, "name", jobType?.name)} placeholder="3rd Floor Bathroom" />
        </Field>
        <Field label="Window label" htmlFor="jt-window" hint="Shown on the grid, e.g. Mon-Wed or Sun." error={fe("windowLabel")}>
          <Input id="jt-window" name="windowLabel" maxLength={40} defaultValue={fieldValue(result, "windowLabel", jobType?.windowLabel)} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Kind" htmlFor="jt-kind" error={fe("kind")}>
          <Select id="jt-kind" name="kind" defaultValue={fieldValue(result, "kind", jobType?.kind ?? "clean")}>
            {JOB_KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="jt-category" error={fe("category")}>
          <Select id="jt-category" name="category" defaultValue={fieldValue(result, "category", jobType?.category ?? "other")}>
            {JOB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Can start" htmlFor="jt-start" hint="Days after the week's Sunday." error={fe("startOffsetDays")}>
          <Select id="jt-start" name="startOffsetDays" defaultValue={fieldValue(result, "startOffsetDays", jobType?.startOffsetDays ?? 1)}>
            {DAYS.slice(0, 14).map((d, i) => (
              <option key={i} value={i}>
                {d} (+{i})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due by" htmlFor="jt-due" hint="7 = the following Sunday." error={fe("dueOffsetDays")}>
          <Select id="jt-due" name="dueOffsetDays" defaultValue={fieldValue(result, "dueOffsetDays", jobType?.dueOffsetDays ?? 7)}>
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d} (+{i})
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <FormRow className="sm:grid-cols-3">
        <Field label="Slots" htmlFor="jt-slots" hint="People needed each week." error={fe("slots")}>
          <Input id="jt-slots" name="slots" type="number" min={1} max={6} required defaultValue={fieldValue(result, "slots", jobType?.slots ?? 1)} />
        </Field>
        <Field label="Points" htmlFor="jt-points" hint="Weight for fairness stats." error={fe("points")}>
          <Input id="jt-points" name="points" type="number" min={0} max={20} required defaultValue={fieldValue(result, "points", jobType?.points ?? 1)} />
        </Field>
        <Field label="Sort order" htmlFor="jt-sort" hint="Lower comes first within its category." error={fe("sortOrder")}>
          <Input id="jt-sort" name="sortOrder" type="number" min={-1000} max={1000} defaultValue={fieldValue(result, "sortOrder", jobType?.sortOrder ?? 0)} />
        </Field>
      </FormRow>
      <Field label="Instructions" htmlFor="jt-instructions" error={fe("instructions")}>
        <Textarea id="jt-instructions" name="instructions" rows={3} maxLength={2000} defaultValue={fieldValue(result, "instructions", jobType?.instructions)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isActive" defaultChecked={checked("isActive", jobType ? jobType.isActive : true)} />
        Active (appears on new weeks and in auto-fill)
      </label>
      <FormMessage result={result} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Saving…">{jobType ? "Save changes" : "Create job type"}</SubmitButton>
        <ButtonLink href="/labor/jobs" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
