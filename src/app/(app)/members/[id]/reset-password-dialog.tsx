"use client";

import { useActionState, useState } from "react";
import { resetPasswordAction } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

function randomPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function ResetForm({ memberId, memberName }: { memberId: number; memberName: string }) {
  const [result, action] = useActionState(resetPasswordAction, null);
  const [value, setValue] = useState("");
  const done = result?.ok === true;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="memberId" value={memberId} />
      <p className="text-sm text-muted">
        {memberName} will be logged out everywhere and must set a new password at next login. Tell them the temporary password in person.
      </p>
      <Field label="Temporary password" htmlFor="temporaryPassword" required hint="At least 8 characters." error={result && !result.ok ? result.fieldErrors?.temporaryPassword : undefined}>
        <div className="flex gap-2">
          <Input
            id="temporaryPassword"
            name="temporaryPassword"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            minLength={8}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={done}
          />
          <Button type="button" variant="outline" onClick={() => setValue(randomPassword())} disabled={done}>
            Generate
          </Button>
        </div>
      </Field>
      <FormMessage result={result} />
      {done ? (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">
          Temporary password: <code className="font-mono font-semibold">{value}</code>
        </p>
      ) : (
        <SubmitButton pendingText="Resetting…" variant="danger">
          Reset password
        </SubmitButton>
      )}
    </form>
  );
}

export function ResetPasswordDialog({ memberId, memberName }: { memberId: number; memberName: string }) {
  return (
    <Dialog trigger="Reset password" triggerVariant="outline" triggerSize="sm" title={`Reset password for ${memberName}`}>
      <ResetForm memberId={memberId} memberName={memberName} />
    </Dialog>
  );
}
