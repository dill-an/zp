"use client";

import { useActionState, useState } from "react";
import { saveBoardVisibility } from "@/lib/actions/sanctions";
import { Checkbox, FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

/** Toggle for the `sanctions_board_public` setting (sanctions.manage only). */
export function BoardVisibilityForm({ current }: { current: boolean }) {
  const [result, action] = useActionState(saveBoardVisibility, null);
  // Controlled so React's post-action form reset cannot snap the box back to what it showed on mount.
  const [checked, setChecked] = useState(current);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="board-public" className="flex items-start gap-2 text-sm">
        <Checkbox id="board-public" name="public" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
        <span>
          Show the house board to every brother
          <span className="block text-xs text-muted">
            A House board tab on Sanctions with open and recently done punishment jobs: brother, job, due date and status. Notes, appeals, fines and sources stay
            between the brother and standards.
          </span>
        </span>
      </label>
      <FormMessage result={result} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
