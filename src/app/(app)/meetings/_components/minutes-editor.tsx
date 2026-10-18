"use client";

import { useActionState, useState } from "react";
import { saveMinutes } from "@/lib/actions/meetings";
import { FormMessage, SubmitButton, Textarea } from "@/components/ui";

export function MinutesEditor({ meetingId, minutes }: { meetingId: number; minutes: string | null }) {
  const bound = saveMinutes.bind(null, meetingId);
  const [result, action] = useActionState(bound, null);
  const [value, setValue] = useState(minutes ?? "");
  return (
    <form action={action} className="space-y-2">
      <Textarea
        name="minutes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder="Minutes. Blank lines separate paragraphs."
        aria-label="Minutes"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" pendingText="Saving…">
          Save minutes
        </SubmitButton>
        <FormMessage result={result} className="py-1" />
      </div>
    </form>
  );
}
