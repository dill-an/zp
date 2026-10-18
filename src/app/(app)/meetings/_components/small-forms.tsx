"use client";

import { useActionState, useEffect } from "react";
import { deleteMeeting, withdrawExcuse } from "@/lib/actions/meetings";
import { ConfirmButton, FormMessage } from "@/components/ui";

export function DeleteMeetingForm({ meetingId, label = "Delete" }: { meetingId: number; label?: string }) {
  const [result, action] = useActionState(() => deleteMeeting(meetingId), null);
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <ConfirmButton variant="danger" size="sm" confirmText="Delete this meeting and its attendance? This cannot be undone.">
        {label}
      </ConfirmButton>
      {result && !result.ok ? <FormMessage result={result} className="py-1" /> : null}
    </form>
  );
}

export function WithdrawExcuseForm({ requestId }: { requestId: number }) {
  const [result, action] = useActionState(() => withdrawExcuse(requestId), null);
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <ConfirmButton variant="ghost" size="sm" confirmText="Withdraw this excuse request?">
        Withdraw
      </ConfirmButton>
      {result && !result.ok ? <FormMessage result={result} className="py-1" /> : null}
    </form>
  );
}

/** Scrolls the element with this id into view once (used by ?member= on the grid). */
export function ScrollToId({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "center", inline: "nearest" });
  }, [id]);
  return null;
}
