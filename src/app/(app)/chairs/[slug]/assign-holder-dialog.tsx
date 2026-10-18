"use client";

import { useActionState, useEffect } from "react";
import { assignChairHolder } from "@/lib/actions/chairs";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormMessage, FormRow, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { MemberSelect } from "@/components/member-select";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

function AssignForm({
  chairId,
  chairName,
  groups,
  today,
  hasCurrent,
  close,
}: {
  chairId: number;
  chairName: string;
  groups: { label: string; members: M[] }[];
  today: string;
  hasCurrent: boolean;
  close: () => void;
}) {
  const [result, action] = useActionState(assignChairHolder, null as ActionResult | null);
  const errors = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);
  // Keyed on the submitted value so the pick survives a failed submit (React's form reset does not re-apply a select's defaultValue).
  const memberId = fieldValue(result, "memberId");
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(close, 600);
      return () => clearTimeout(t);
    }
  }, [result, close]);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="chairId" value={chairId} />
      <Field label="Brother" htmlFor="memberId" required error={errors("memberId")}>
        <MemberSelect key={`m-${memberId}`} id="memberId" name="memberId" groups={groups} required defaultValue={memberId} />
      </Field>
      <FormRow>
        <Field label="Term starts" htmlFor="termStart" required error={errors("termStart")}>
          <Input id="termStart" name="termStart" type="date" required defaultValue={fieldValue(result, "termStart", today)} />
        </Field>
        <Field label="Title" htmlFor="title" hint="Optional, e.g. Co-chair." error={errors("title")}>
          <Input id="title" name="title" autoComplete="off" defaultValue={fieldValue(result, "title")} />
        </Field>
      </FormRow>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="keepCurrent" className="mt-0.5" defaultChecked={result && !result.ok && result.values ? "keepCurrent" in result.values : false} />
        <span>
          <span className="font-medium">Co-chair: keep the current holder{hasCurrent ? "" : "s"}</span>
          <span className="block text-xs text-muted">{hasCurrent ? "Otherwise the current term ends the day before the new one starts." : `Nobody holds ${chairName} right now, so this makes no difference.`}</span>
        </span>
      </label>
      <FormMessage result={result} />
      <SubmitButton pendingText="Assigning…">Assign</SubmitButton>
    </form>
  );
}

export function AssignHolderDialog(props: { chairId: number; chairName: string; groups: { label: string; members: M[] }[]; today: string; hasCurrent: boolean }) {
  return (
    <Dialog trigger="Assign holder" triggerSize="sm" title={`Assign ${props.chairName}`}>
      {(close) => <AssignForm {...props} close={close} />}
    </Dialog>
  );
}
