"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { fieldValue } from "@/lib/action-result";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [result, action] = useActionState(login, null);
  return (
    <Card>
      <CardContent className="py-5">
        <form action={action} className="space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label="Username" htmlFor="username" hint="first.last, e.g. dylan.nguyen">
            <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoFocus required defaultValue={fieldValue(result, "username")} />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <FormMessage result={result} />
          <SubmitButton className="w-full" pendingText="Logging in…">
            Log in
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
