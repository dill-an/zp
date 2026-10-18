"use client";

import { useActionState } from "react";
import { Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/ui";
import { MemberSelect } from "@/components/member-select";
import { assignMaintenance, changeMaintenanceStatus } from "@/lib/actions/community";
import { fieldValue } from "@/lib/action-result";
import { humanize } from "@/lib/utils";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

export function AssignForm({ requestId, groups, current, compact = false }: { requestId: number; groups: { label: string; members: M[] }[]; current: number | null; compact?: boolean }) {
  const [result, action] = useActionState(assignMaintenance.bind(null, requestId), null);
  const id = `assign-${requestId}`;
  return (
    <form action={action} className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      <Field label="Assign to" htmlFor={id} className={compact ? "min-w-48 flex-1" : undefined}>
        <MemberSelect id={id} name="assignedToId" groups={groups} placeholder="Nobody" defaultValue={fieldValue(result, "assignedToId", current == null ? "" : String(current))} />
      </Field>
      <SubmitButton size={compact ? "md" : "sm"} variant="outline" pendingText="Saving…">
        Assign
      </SubmitButton>
      <FormMessage result={result} className={compact ? "basis-full" : undefined} />
    </form>
  );
}

export function StatusForm({
  requestId,
  statuses,
  current,
  notes,
  withNotes = true,
  compact = false,
}: {
  requestId: number;
  statuses: readonly string[];
  current: string;
  notes: string | null;
  withNotes?: boolean;
  compact?: boolean;
}) {
  const [result, action] = useActionState(changeMaintenanceStatus.bind(null, requestId), null);
  const id = `status-${requestId}`;
  return (
    <form action={action} className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      <Field label="Status" htmlFor={id} className={compact ? "min-w-40 flex-1" : undefined}>
        <Select id={id} name="status" defaultValue={fieldValue(result, "status", current)}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </Field>
      {withNotes ? (
        <Field label="Resolution notes" htmlFor={`${id}-notes`} hint="What was done, or why it will not be fixed.">
          <Textarea id={`${id}-notes`} name="resolutionNotes" rows={3} maxLength={5000} defaultValue={fieldValue(result, "resolutionNotes", notes ?? "")} />
        </Field>
      ) : null}
      <SubmitButton size={compact ? "md" : "sm"} variant="outline" pendingText="Saving…">
        Update status
      </SubmitButton>
      <FormMessage result={result} className={compact ? "basis-full" : undefined} />
    </form>
  );
}
