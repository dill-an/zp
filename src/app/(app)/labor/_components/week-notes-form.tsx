"use client";

import { useActionState } from "react";
import { FormMessage, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldValue } from "@/lib/action-result";
import { updateWeekNotes } from "@/lib/actions/labor";

/** Manage mode: the week notes textarea. Keeps the typed text when the save fails (React resets the form). */
export function WeekNotesForm({ weekId, notes }: { weekId: number; notes: string | null }) {
  const [result, action] = useActionState(updateWeekNotes, null);
  return (
    <form action={action} className="max-w-xl space-y-2">
      <input type="hidden" name="weekId" value={weekId} />
      <label htmlFor="week-notes" className="block text-sm font-medium">
        Week notes
      </label>
      <Textarea id="week-notes" name="notes" rows={2} defaultValue={fieldValue(result, "notes", notes)} placeholder="Anything brothers should know this week (inspection Sunday 6pm, supplies in the closet...)" />
      <FormMessage result={result} />
      <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
        Save notes
      </SubmitButton>
    </form>
  );
}
