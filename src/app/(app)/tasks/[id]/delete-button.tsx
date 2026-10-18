"use client";

import { useActionState } from "react";
import { deleteTask } from "@/lib/actions/tasks";
import { ConfirmButton } from "@/components/ui/confirm-button";

export function DeleteTaskButton({ taskId, title }: { taskId: number; title: string }) {
  const [result, action] = useActionState(deleteTask, null);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <ConfirmButton confirmText={`Delete "${title}"? This removes its checklist and activity too.`} variant="outline" size="md" className="text-danger">
        Delete
      </ConfirmButton>
      {result && !result.ok ? (
        <p role="alert" className="text-xs text-danger">
          {result.error}
        </p>
      ) : null}
    </form>
  );
}
