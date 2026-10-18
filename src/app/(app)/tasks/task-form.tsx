"use client";

import { useActionState, useState } from "react";
import { TASK_PRIORITIES, TASK_RECURRENCES } from "@/db/schema";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { displayName } from "@/lib/names";
import { RECURRENCE_LABELS } from "@/lib/queries/tasks-logic";
import type { TaskPerson } from "@/lib/queries/tasks";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { humanize } from "@/lib/utils";

export type TaskFormDefaults = {
  title?: string;
  description?: string;
  chairId?: number | null;
  assigneeIds?: number[];
  /** "YYYY-MM-DDTHH:mm" in house time. */
  dueAtLocal?: string;
  priority?: string;
  recurrence?: string;
  checklistText?: string;
  tags?: string;
};

export type TaskFormProps = {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  /** Chairs this user may file the task under. Empty means the task can only be General. */
  chairs: { id: number; name: string }[];
  memberGroups: { label: string; members: TaskPerson[] }[];
  currentUserId: number;
  defaults?: TaskFormDefaults;
  submitLabel: string;
  cancelHref: string;
  mode: "create" | "edit";
};

export function TaskForm({ action, chairs, memberGroups, currentUserId, defaults = {}, submitLabel, cancelHref, mode }: TaskFormProps) {
  const [result, formAction] = useActionState(action, null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(defaults.assigneeIds ?? []));
  const errors = result && !result.ok ? result.fieldErrors ?? {} : {};
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectedNames = memberGroups
    .flatMap((g) => g.members)
    .filter((m) => selected.has(m.id))
    .map((m) => displayName(m));

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardContent className="space-y-4 py-4">
          <Field label="Title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" required maxLength={200} autoFocus={mode === "create"} defaultValue={fieldValue(result, "title", defaults.title)} placeholder="What needs to happen?" />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description} hint="Context, links, how to know it is done.">
            <Textarea id="description" name="description" rows={4} defaultValue={fieldValue(result, "description", defaults.description)} />
          </Field>
          <FormRow>
            {chairs.length > 0 ? (
              <Field label="Chair" htmlFor="chairId" error={errors.chairId} hint="Leave as General for a task that is not part of a chair's board.">
                <Select id="chairId" name="chairId" defaultValue={fieldValue(result, "chairId", defaults.chairId ?? "")}>
                  <option value="">General (no chair)</option>
                  {chairs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Chair" hint="Chair boards are managed by the chair holders. This task will be filed under General.">
                <p className="flex h-10 items-center text-sm text-muted" data-testid="chair-locked">
                  General (no chair)
                </p>
              </Field>
            )}
            <Field label="Due" htmlFor="dueAt" error={errors.dueAt} hint="House time (New York). Leave blank for no deadline.">
              <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={fieldValue(result, "dueAt", defaults.dueAtLocal)} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Priority" htmlFor="priority" error={errors.priority}>
              <Select id="priority" name="priority" defaultValue={fieldValue(result, "priority", defaults.priority ?? "normal")}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Repeats" htmlFor="recurrence" error={errors.recurrence} hint="When marked done, the next occurrence is created automatically.">
              <Select id="recurrence" name="recurrence" defaultValue={fieldValue(result, "recurrence", defaults.recurrence ?? "none")}>
                {TASK_RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              Assign to
              <span className="ml-1.5 text-xs font-normal text-muted">{selected.size === 0 ? "nobody yet" : `${selected.size} selected`}</span>
            </p>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-primary hover:underline" onClick={() => toggle(currentUserId, !selected.has(currentUserId))}>
                {selected.has(currentUserId) ? "Remove me" : "Assign to me"}
              </button>
              {selected.size > 0 ? (
                <button type="button" className="text-muted hover:underline" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          {selectedNames.length ? <p className="text-xs text-muted">{selectedNames.join(", ")}</p> : null}
          {errors.assigneeIds ? <p className="text-xs text-danger">{errors.assigneeIds[0]}</p> : null}
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-3" data-testid="assignee-list">
            {memberGroups.map((g) => (
              <fieldset key={g.label}>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</legend>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {g.members.map((m) => {
                    const id = `assignee-${m.id}`;
                    return (
                      <label key={m.id} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
                        <Checkbox id={id} name="assigneeIds[]" value={m.id} checked={selected.has(m.id)} onChange={(e) => toggle(m.id, e.currentTarget.checked)} />
                        <span className="truncate">
                          {displayName(m)}
                          {m.id === currentUserId ? <span className="text-muted"> (you)</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-4">
          <Field label="Checklist" htmlFor="checklist" error={errors.checklist} hint={mode === "edit" ? "One item per line. Items you keep stay checked; removed lines are deleted." : "One item per line. Optional."}>
            <Textarea id="checklist" name="checklist" rows={4} defaultValue={fieldValue(result, "checklist", defaults.checklistText)} placeholder={"Confirm budget with treasurer\nBook the room\nPost in the group chat"} />
          </Field>
          <Field label="Tags" htmlFor="tags" error={errors.tags} hint="Comma separated, e.g. budget, rush, urgent-ish.">
            <Input id="tags" name="tags" defaultValue={fieldValue(result, "tags", defaults.tags)} />
          </Field>
        </CardContent>
      </Card>

      <FormMessage result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
