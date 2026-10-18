import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const control =
  "block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-primary disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24", className)} {...props} />;
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return <input type="checkbox" className={cn("h-4 w-4 rounded border-border accent-primary", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1 block text-sm font-medium", className)} {...props} />;
}

/** Label + control + optional hint/error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      {children}
      {err ? <p className="text-xs text-danger">{err}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Renders the outcome of a server action (use with useActionState or a plain result prop). */
export function FormMessage({ result, className }: { result?: ActionResult | null; className?: string }) {
  if (!result) return null;
  if (result.ok) {
    if (!result.message) return null;
    return (
      <p role="status" className={cn("rounded-md bg-success-soft px-3 py-2 text-sm text-success", className)}>
        {result.message}
      </p>
    );
  }
  return (
    <p role="alert" className={cn("rounded-md bg-danger-soft px-3 py-2 text-sm text-danger", className)}>
      {result.error}
    </p>
  );
}

export function FormRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-3 sm:grid-cols-2", className)} {...props} />;
}
