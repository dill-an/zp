import { notFound } from "next/navigation";
import { EVENT_KINDS } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { listChairs } from "@/lib/queries/common";
import { getEvent } from "@/lib/queries/community";
import { updateEvent } from "@/lib/actions/community";
import { isoToLocalInput } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { EventForm } from "../../event-form";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("events.manage");
  const { id: idParam } = await params;
  const id = Number(idParam);
  const event = Number.isInteger(id) ? getEvent(id) : null;
  if (!event) notFound();
  const chairs = listChairs({ includeInactive: true })
    .filter((c) => c.isActive || c.id === event.chairId)
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit event" eyebrow={event.title} />
      <Card>
        <CardContent className="py-4">
          <EventForm
            action={updateEvent.bind(null, event.id)}
            kinds={EVENT_KINDS}
            chairs={chairs}
            initial={{
              title: event.title,
              kind: event.kind,
              startsAt: isoToLocalInput(event.startsAt),
              endsAt: isoToLocalInput(event.endsAt),
              location: event.location ?? "",
              description: event.description ?? "",
              chairId: event.chairId == null ? "" : String(event.chairId),
              isMandatory: event.isMandatory,
              rsvpEnabled: event.rsvpEnabled,
              budget: centsToInput(event.budgetCents),
            }}
            submitLabel="Save changes"
            cancelHref={`/events/${event.id}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
