"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { changeTaskStatus } from "@/lib/actions/tasks";
import { SubmitButton } from "@/components/ui/submit-button";

/** One-click "Done" for list rows. Only rendered for people allowed to act on the task. */
export function QuickDoneButton({ taskId, title, className }: { taskId: number; title: string; className?: string }) {
  const [result, action] = useActionState(changeTaskStatus, null);
  return (
    <form action={action} className={className}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value="done" />
      <SubmitButton size="sm" variant="outline" pendingText="Saving…" aria-label={`Mark "${title}" done`} title="Mark done">
        <Check className="h-4 w-4" aria-hidden />
        Done
      </SubmitButton>
      {result && !result.ok ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {result.error}
        </p>
      ) : null}
    </form>
  );
}
