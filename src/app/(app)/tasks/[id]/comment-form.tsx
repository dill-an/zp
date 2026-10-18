"use client";

import { useActionState } from "react";
import { addComment } from "@/lib/actions/tasks";
import { fieldValue } from "@/lib/action-result";
import { FormMessage, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function CommentForm({ taskId }: { taskId: number }) {
  const [result, action] = useActionState(addComment, null);
  return (
    <form action={action} className="space-y-2" data-testid="comment-form">
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea name="body" rows={2} placeholder="Add a comment or an update" aria-label="Comment" maxLength={4000} required className="min-h-16" defaultValue={fieldValue(result, "body")} />
      <div className="flex items-center justify-between gap-2">
        {result && !result.ok ? <FormMessage result={result} className="flex-1" /> : <span />}
        <SubmitButton size="sm" variant="secondary" pendingText="Posting…">
          Post
        </SubmitButton>
      </div>
    </form>
  );
}
