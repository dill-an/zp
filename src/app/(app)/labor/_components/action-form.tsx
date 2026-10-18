"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Small form around a server action: renders hidden fields, the trigger(s) you pass as children
 * and the action's error (or success) message inline. Use for buttons that need feedback.
 */
export function ActionForm({
  action,
  hidden,
  children,
  className,
  showSuccess = false,
  stacked = false,
}: {
  action: FormAction;
  hidden?: Record<string, string | number>;
  children: ReactNode;
  className?: string;
  showSuccess?: boolean;
  stacked?: boolean;
}) {
  const [result, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn(stacked ? "space-y-2" : "inline-flex flex-wrap items-center gap-2", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      {children}
      {result && !result.ok ? (
        <span role="alert" className="text-xs text-danger">
          {result.error}
        </span>
      ) : null}
      {showSuccess && result?.ok && result.message ? (
        <span role="status" className="text-xs text-success">
          {result.message}
        </span>
      ) : null}
    </form>
  );
}
