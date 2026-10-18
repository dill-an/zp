"use client";

import { useActionState } from "react";
import { savePolicy } from "@/lib/actions/sanctions";
import { fieldValue } from "@/lib/action-result";
import { Field, FormMessage, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function PolicyForm({ current }: { current: string }) {
  const [result, action] = useActionState(savePolicy, null);
  return (
    <form action={action} className="space-y-3">
      <Field label="Policy text" htmlFor="policy" hint="Plain text. Leave a blank line between paragraphs.">
        <Textarea id="policy" name="policy" rows={12} className="min-h-64 font-mono text-sm" defaultValue={fieldValue(result, "policy", current)} />
      </Field>
      <FormMessage result={result} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save policy</SubmitButton>
      </div>
    </form>
  );
}
