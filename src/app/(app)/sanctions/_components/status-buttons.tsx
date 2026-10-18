"use client";

import { useActionState, useEffect } from "react";
import { appealSanction, completeSanction, deleteSanction, reopenSanction, startSanction, verifySanction, waiveSanction } from "@/lib/actions/sanctions";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type StatusAction = "start" | "complete" | "verify" | "waive" | "reopen";

const ACTIONS: Record<StatusAction, (id: number) => Promise<ActionResult>> = {
  start: startSanction,
  complete: completeSanction,
  verify: verifySanction,
  waive: waiveSanction,
  reopen: reopenSanction,
};

const DEFAULTS: Record<StatusAction, { label: string; pending: string; variant: ButtonVariant; confirm?: string }> = {
  start: { label: "Start", pending: "Starting…", variant: "secondary" },
  complete: { label: "Mark completed", pending: "Saving…", variant: "primary" },
  verify: { label: "Verify", pending: "Verifying…", variant: "primary" },
  waive: { label: "Waive", pending: "Waiving…", variant: "outline", confirm: "Waive this sanction? Any fine will be credited back." },
  reopen: { label: "Reopen", pending: "Reopening…", variant: "outline", confirm: "Reopen this sanction? It goes back to open." },
};

/** One-click status change (start, complete, verify, waive, reopen) with inline error. */
export function StatusButton({
  id,
  action,
  size = "sm",
  variant,
  className,
  children,
}: {
  id: number;
  action: StatusAction;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  children?: React.ReactNode;
}) {
  const [result, formAction] = useActionState(() => ACTIONS[action](id), null as ActionResult | null);
  const d = DEFAULTS[action];
  return (
    <form action={formAction} className={cn("inline-flex flex-col items-start", className)}>
      {d.confirm ? (
        <ConfirmButton confirmText={d.confirm} variant={variant ?? d.variant} size={size} data-action={action}>
          {children ?? d.label}
        </ConfirmButton>
      ) : (
        <SubmitButton variant={variant ?? d.variant} size={size} pendingText={d.pending} data-action={action}>
          {children ?? d.label}
        </SubmitButton>
      )}
      {result && !result.ok ? (
        <span role="alert" className="mt-1 max-w-56 text-xs text-danger">
          {result.error}
        </span>
      ) : null}
    </form>
  );
}

/** Delete with confirmation; the action redirects to the board on success. */
export function DeleteButton({ id, size = "sm", className }: { id: number; size?: ButtonSize; className?: string }) {
  const [result, formAction] = useActionState(() => deleteSanction(id), null as ActionResult | null);
  return (
    <form action={formAction} className={cn("inline-flex flex-col items-start", className)}>
      <ConfirmButton confirmText="Delete this sanction and any linked fine? This cannot be undone." variant="danger" size={size} data-action="delete">
        Delete
      </ConfirmButton>
      {result && !result.ok ? (
        <span role="alert" className="mt-1 max-w-56 text-xs text-danger">
          {result.error}
        </span>
      ) : null}
    </form>
  );
}

/** "Appeal" button opening a dialog that asks for the reason. */
export function AppealDialog({ id, size = "sm" }: { id: number; size?: ButtonSize }) {
  return (
    <Dialog trigger="Appeal" triggerVariant="outline" triggerSize={size} title="Appeal this sanction">
      {(close) => <AppealForm id={id} close={close} />}
    </Dialog>
  );
}

function AppealForm({ id, close }: { id: number; close: () => void }) {
  const [result, formAction] = useActionState(appealSanction.bind(null, id), null);
  useEffect(() => {
    if (result?.ok) close();
  }, [result, close]);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted">Standards will review it. The sanction stays on your list until they decide.</p>
      <Field label="Why should this be reviewed?" htmlFor="appeal-reason" required error={!result?.ok ? result?.fieldErrors?.reason : undefined}>
        <Textarea id="appeal-reason" name="reason" required minLength={3} maxLength={1000} autoFocus defaultValue={fieldValue(result, "reason")} placeholder="I was away that week and had told the house manager." />
      </Field>
      {result && !result.ok ? <FormMessage result={result} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <SubmitButton pendingText="Sending…">Send appeal</SubmitButton>
      </div>
    </form>
  );
}
