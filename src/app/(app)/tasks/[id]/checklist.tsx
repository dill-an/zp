"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "@/lib/actions/tasks";
import { fieldValue } from "@/lib/action-result";
import type { ChecklistItem } from "@/lib/queries/tasks";
import { Checkbox, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function Checklist({ taskId, items, canAct }: { taskId: number; items: ChecklistItem[]; canAct: boolean }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-sm text-muted">No checklist items{canAct ? " yet. Add the steps below." : "."}</p> : null}
      <ul className="divide-y divide-border" data-testid="checklist">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} canAct={canAct} />
        ))}
      </ul>
      {canAct ? <AddItemForm taskId={taskId} /> : null}
    </div>
  );
}

function ChecklistRow({ item, canAct }: { item: ChecklistItem; canAct: boolean }) {
  const [result, toggle] = useActionState(toggleChecklistItem, null);
  const [removeResult, remove] = useActionState(deleteChecklistItem, null);
  return (
    <li className="flex items-center gap-2 py-1.5" data-testid="checklist-item" data-done={item.isDone ? "1" : "0"}>
      <form action={toggle} className="flex min-w-0 flex-1 items-center">
        <input type="hidden" name="itemId" value={item.id} />
        <ToggleBox item={item} canAct={canAct} failed={!!result && !result.ok} />
      </form>
      {canAct ? (
        <form action={remove}>
          <input type="hidden" name="itemId" value={item.id} />
          <RemoveButton label={item.label} />
        </form>
      ) : null}
      {result && !result.ok ? <span className="text-xs text-danger">{result.error}</span> : null}
      {removeResult && !removeResult.ok ? <span className="text-xs text-danger">{removeResult.error}</span> : null}
    </li>
  );
}

function ToggleBox({ item, canAct, failed }: { item: ChecklistItem; canAct: boolean; failed: boolean }) {
  const { pending } = useFormStatus();
  const [checked, setChecked] = useState(item.isDone);
  useEffect(() => setChecked(item.isDone), [item.isDone, failed]);
  return (
    <label className={cn("flex min-w-0 flex-1 items-center gap-2.5 text-sm", canAct ? "cursor-pointer" : "")}>
      <Checkbox
        checked={checked}
        disabled={!canAct || pending}
        aria-label={item.label}
        onChange={(e) => {
          setChecked(e.currentTarget.checked);
          e.currentTarget.form?.requestSubmit();
        }}
      />
      <span className={cn("min-w-0 break-words", checked ? "text-muted line-through" : "")}>{item.label}</span>
    </label>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Remove "${label}"`}
      title="Remove item"
      className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50"
      onClick={(e) => {
        if (!window.confirm(`Remove "${label}" from the checklist?`)) e.preventDefault();
      }}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

function AddItemForm({ taskId }: { taskId: number }) {
  const [result, action] = useActionState(addChecklistItem, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex gap-2">
        <Input name="label" placeholder="Add a step" aria-label="New checklist item" maxLength={300} defaultValue={fieldValue(result, "label")} className="flex-1" />
        <SubmitButton size="md" variant="secondary" pendingText="Adding…">
          Add
        </SubmitButton>
      </div>
      {result && !result.ok ? <FormMessage result={result} /> : null}
    </form>
  );
}
