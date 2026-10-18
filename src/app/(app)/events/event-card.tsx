import Link from "next/link";
import { Card, CardContent, ButtonLink, ConfirmButton, StatusPill } from "@/components/ui";
import { deleteEvent } from "@/lib/actions/community";
import { formatEventRange } from "@/lib/queries/community-logic";
import type { EventListItem } from "@/lib/queries/community";
import { KindBadge, MandatoryBadge } from "./badges";

/** One event on the list page. */
export function EventCard({ event, manage }: { event: EventListItem; manage: boolean }) {
  const { counts } = event;
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={event.kind} />
          {event.isMandatory ? <MandatoryBadge /> : null}
          {event.myRsvp ? <StatusPill status={event.myRsvp} label={`You: ${event.myRsvp.replace("_", " ")}`} /> : null}
        </div>
        <h3 className="text-base font-semibold leading-tight">
          <Link href={`/events/${event.id}`} className="hover:underline">
            {event.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">{formatEventRange(event.startsAt, event.endsAt)}</p>
        {event.location ? <p className="text-sm text-muted">{event.location}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
          {event.rsvpEnabled ? (
            <span>
              {counts.going} going{counts.guests ? ` (+${counts.guests} guests)` : ""}, {counts.maybe} maybe
            </span>
          ) : (
            <span>No RSVPs</span>
          )}
          {event.chair ? (
            <Link href={`/chairs/${event.chair.slug}`} className="hover:underline">
              {event.chair.name}
            </Link>
          ) : null}
        </div>
        {manage ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <ButtonLink href={`/events/${event.id}/edit`} variant="outline" size="sm">
              Edit
            </ButtonLink>
            <form
              action={async () => {
                "use server";
                await deleteEvent(event.id);
              }}
            >
              <ConfirmButton confirmText={`Delete "${event.title}"? RSVPs and duties go with it.`} variant="ghost" size="sm" className="text-danger">
                Delete
              </ConfirmButton>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
