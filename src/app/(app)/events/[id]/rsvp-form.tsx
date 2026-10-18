"use client";

import { useActionState } from "react";
import { FormMessage, Input, Label, SubmitButton } from "@/components/ui";
import { setRsvp } from "@/lib/actions/community";
import { fieldValue } from "@/lib/action-result";

const CHOICES = [
  { status: "going", label: "Going" },
  { status: "maybe", label: "Maybe" },
  { status: "not_going", label: "Not going" },
] as const;

/** Three submit buttons share one form; the clicked button sends the status. */
export function RsvpForm({ eventId, current, guests }: { eventId: number; current: string | null; guests: number }) {
  const [result, action] = useActionState(setRsvp.bind(null, eventId), null);
  return (
    <form action={action} className="space-y-3" aria-label="RSVP">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <SubmitButton key={c.status} name="status" value={c.status} variant={current === c.status ? "primary" : "outline"} pendingText={c.label} aria-pressed={current === c.status}>
              {c.label}
            </SubmitButton>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="guests" className="mb-0">
            Guests
          </Label>
          <Input id="guests" name="guests" type="number" min={0} max={20} className="w-20" defaultValue={fieldValue(result, "guests", guests)} />
        </div>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
