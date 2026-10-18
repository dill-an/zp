"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { ConfirmButton, FormMessage } from "@/components/ui";
import { MemberLink } from "@/components/member-link";

type Person = { id: number; firstName: string; lastName: string; preferredName: string };

/**
 * Two-step absence action: shows who would be affected (the preview), then a confirm button
 * runs the bound server action. After the action the page revalidates and the preview shrinks.
 */
export function AbsencePanel({ meetingId, members, action, buttonLabel, confirmText, emptyText, testId }: {
  meetingId: number;
  members: Person[];
  action: (meetingId: number) => Promise<ActionResult>;
  buttonLabel: string;
  confirmText: string;
  emptyText: string;
  testId: string;
}) {
  const [result, formAction] = useActionState(() => action(meetingId), null);
  return (
    <div className="space-y-3" data-testid={testId}>
      {members.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {members.map((m) => (
            <li key={m.id}>
              <MemberLink member={m} />
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        {members.length > 0 ? (
          <ConfirmButton variant="primary" confirmText={confirmText}>
            {buttonLabel}
          </ConfirmButton>
        ) : null}
        <FormMessage result={result} className="py-1" />
      </form>
    </div>
  );
}
