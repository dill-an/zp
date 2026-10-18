import { EVENT_KINDS } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { listChairs } from "@/lib/queries/common";
import { createEvent } from "@/lib/actions/community";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { EventForm } from "../event-form";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requirePermission("events.manage");
  const chairs = listChairs().map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New event" eyebrow="Events" />
      <Card>
        <CardContent className="py-4">
          <EventForm action={createEvent} kinds={EVENT_KINDS} chairs={chairs} submitLabel="Create event" cancelHref="/events" />
        </CardContent>
      </Card>
    </div>
  );
}
