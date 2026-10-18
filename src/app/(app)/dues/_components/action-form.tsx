"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Calls `onDone` once the action succeeds (used to close dialogs). */
export function useCloseOnSuccess(result: ActionResult | null, onDone?: () => void) {
  useEffect(() => {
    if (result?.ok && onDone) onDone();
  }, [result, onDone]);
}

/**
 * Small inline form for button-only actions (delete, approve, ...): hidden fields plus the buttons passed as children.
 * Shows the action's error next to the buttons.
 */
export function ActionForm({
  action,
  fields,
  children,
  className,
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  children: ReactNode;
  className?: string;
}) {
  const [result, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      {children}
      {result && !result.ok ? (
        <span role="alert" className="text-xs text-danger">
          {result.error}
        </span>
      ) : null}
    </form>
  );
}
