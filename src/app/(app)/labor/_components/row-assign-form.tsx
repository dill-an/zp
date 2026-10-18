"use client";

import { useActionState } from "react";
import { MemberSelect } from "@/components/member-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldValue } from "@/lib/action-result";
import { saveRowAssignments } from "@/lib/actions/labor";

export type PickGroup = { label: string; members: { id: number; firstName: string; lastName: string; preferredName: string }[] };

/** Manage mode: one select per slot and a Save button for a single job row. */
export function RowAssignForm({
  weekId,
  jobTypeId,
  slots,
  groups,
}: {
  weekId: number;
  jobTypeId: number;
  /** Current member id per slot (null = open) plus whether the slot is locked (done/missed/excused). */
  slots: { slot: number; memberId: number | null; locked: boolean; lockedLabel?: string }[];
  groups: PickGroup[];
}) {
  const [result, action] = useActionState(saveRowAssignments, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="weekId" value={weekId} />
      <input type="hidden" name="jobTypeId" value={jobTypeId} />
      {slots.map((s) => {
        // After a failed save React resets the form; keep the manager's picks instead of the saved assignees.
        // The key remounts the select, because React never re-applies a changed defaultValue to a <select>.
        const value = fieldValue(result, `slot_${s.slot}`, s.memberId ?? "");
        return (
          <div key={s.slot} className="min-w-0 flex-1 basis-40">
            <MemberSelect
              key={value}
              name={`slot_${s.slot}`}
              aria-label={`Slot ${s.slot}`}
              groups={groups}
              placeholder="Open"
              defaultValue={value}
              disabled={s.locked}
              title={s.locked ? `Already ${s.lockedLabel ?? "resolved"}; reset it on the Verify page to change it.` : undefined}
              className="h-9 text-sm"
            />
          </div>
        );
      })}
      <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
        Save
      </SubmitButton>
      {result && !result.ok ? (
        <span role="alert" className="basis-full text-xs text-danger">
          {result.error}
        </span>
      ) : null}
      {result?.ok && result.message && result.message !== "No changes." ? (
        <span role="status" className="basis-full text-xs text-success">
          {result.message}
        </span>
      ) : null}
    </form>
  );
}
