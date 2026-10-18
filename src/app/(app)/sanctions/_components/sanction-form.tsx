"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createSanction, updateSanction } from "@/lib/actions/sanctions";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { MemberSelect } from "@/components/member-select";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { displayName } from "@/lib/names";
import { SOURCE_LABELS } from "./format";

type M = { id: number; firstName: string; lastName: string; preferredName: string };
export type MemberGroup = { label: string; members: M[] };

export type SanctionFormDefaults = {
  memberId?: number | null;
  reason?: string;
  jobDescription?: string | null;
  hours?: number | null;
  /** "25.00" style string */
  fineDollars?: string;
  source?: string;
  /** "YYYY-MM-DDTHH:mm" in the house timezone */
  dueAtLocal?: string;
  notes?: string | null;
};

export function SanctionForm({
  mode,
  id,
  groups,
  sources,
  defaults,
  memberName,
  cancelHref,
}: {
  mode: "create" | "edit";
  id?: number;
  groups: MemberGroup[];
  sources: readonly string[];
  defaults: SanctionFormDefaults;
  /** Edit mode: the brother the sanction belongs to (not editable). */
  memberName?: string;
  cancelHref: string;
}) {
  const action = mode === "edit" && id != null ? updateSanction.bind(null, id) : createSanction;
  const [result, formAction] = useActionState(action, null);
  const [multi, setMulti] = useState(false);
  const errors = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);

  return (
    <Card>
      <CardContent className="py-5">
        <form action={formAction} className="space-y-4">
          {mode === "create" ? (
            <MemberPicker groups={groups} multi={multi} setMulti={setMulti} result={result} defaultMemberId={defaults.memberId ?? null} error={errors("memberId") ?? errors("memberIds")} />
          ) : (
            <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Brother: </span>
              <span className="font-medium">{memberName}</span>
            </div>
          )}

          <Field label="Reason" htmlFor="reason" required error={errors("reason")} hint="What happened, e.g. Missed Tuesday kitchen clean.">
            <Input id="reason" name="reason" required maxLength={300} defaultValue={fieldValue(result, "reason", defaults.reason)} />
          </Field>

          <Field label="Punishment job" htmlFor="jobDescription" error={errors("jobDescription")} hint="What they have to do. Leave blank for a fine or hours only.">
            <Textarea id="jobDescription" name="jobDescription" className="min-h-20" maxLength={500} defaultValue={fieldValue(result, "jobDescription", defaults.jobDescription)} placeholder="Deep clean the basement bathroom" />
          </Field>

          <FormRow>
            <Field label="Work hours" htmlFor="hours" error={errors("hours")} hint="Whole hours owed, if any.">
              <Input id="hours" name="hours" type="number" inputMode="numeric" min={0} max={200} step={1} defaultValue={fieldValue(result, "hours", defaults.hours)} />
            </Field>
            <Field label="Fine (dollars)" htmlFor="fineDollars" error={errors("fineDollars")} hint="Adds a fine to their dues ledger. 0 or blank for none.">
              <Input id="fineDollars" name="fineDollars" inputMode="decimal" placeholder="0.00" defaultValue={fieldValue(result, "fineDollars", defaults.fineDollars)} />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Source" htmlFor="source" error={errors("source")}>
              <Select id="source" name="source" defaultValue={fieldValue(result, "source", defaults.source ?? "manual")}>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s] ?? s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due by" htmlFor="dueAt" error={errors("dueAt")} hint="When the job must be done.">
              <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={fieldValue(result, "dueAt", defaults.dueAtLocal)} />
            </Field>
          </FormRow>

          <Field label="Notes" htmlFor="notes" error={errors("notes")} hint="Visible to the brother.">
            <Textarea id="notes" name="notes" className="min-h-20" maxLength={2000} defaultValue={fieldValue(result, "notes", defaults.notes)} />
          </Field>

          <FormMessage result={result} />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={cancelHref} className={buttonClasses("ghost")}>
              Cancel
            </Link>
            <SubmitButton pendingText={mode === "edit" ? "Saving…" : "Issuing…"}>{mode === "edit" ? "Save changes" : multi ? "Issue to selected" : "Issue sanction"}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberPicker({
  groups,
  multi,
  setMulti,
  result,
  defaultMemberId,
  error,
}: {
  groups: MemberGroup[];
  multi: boolean;
  setMulti: (v: boolean) => void;
  result: ActionResult | null;
  defaultMemberId: number | null;
  error?: string[];
}) {
  const failedValues = result && !result.ok ? result.values : undefined;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {multi ? "Brothers" : "Brother"}
          <span className="text-danger"> *</span>
        </span>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="multi" value="1" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          Apply to several brothers
        </label>
      </div>
      {multi ? (
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-3">
          {groups.map((g) => (
            <fieldset key={g.label}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {g.members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
                    <Checkbox name="memberIds[]" value={m.id} defaultChecked={m.id === defaultMemberId} />
                    {displayName(m)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted">One sanction is created per brother, each with its own fine.</p>
        </div>
      ) : (
        <MemberSelect id="memberId" name="memberId" groups={groups} required defaultValue={failedValues?.memberId ?? (defaultMemberId ? String(defaultMemberId) : "")} />
      )}
      {error?.length ? <p className="text-xs text-danger">{error[0]}</p> : null}
    </div>
  );
}
