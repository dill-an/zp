"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { changePassword } from "@/lib/actions/auth";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ChangePasswordForm() {
  const [result, action] = useActionState(changePassword, null);
  const router = useRouter();
  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);
  return (
    <form action={action} className="space-y-4">
      <Field label="Current password" htmlFor="currentPassword">
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <FormMessage result={result} />
      <SubmitButton pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}
