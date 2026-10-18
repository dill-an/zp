"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TaskStatus } from "@/db/schema";
import { changeTaskStatus } from "@/lib/actions/tasks";
import { statusActions, type StatusAction } from "@/lib/queries/tasks-logic";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

/** Start / Block / Done / Reopen / Cancel buttons for the detail page. */
export function StatusActions({ taskId, status }: { taskId: number; status: TaskStatus }) {
  const [result, action] = useActionState(changeTaskStatus, null);
  const actions = statusActions(status);
  return (
    <form action={action} className="space-y-2" data-testid="status-actions">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <ActionButton key={a.status} action={a} />
        ))}
      </div>
      <FormMessage result={result} />
    </form>
  );
}

function ActionButton({ action }: { action: StatusAction }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="status" value={action.status} variant={action.variant} size="sm" disabled={pending} aria-busy={pending}>
      {action.label}
    </Button>
  );
}
