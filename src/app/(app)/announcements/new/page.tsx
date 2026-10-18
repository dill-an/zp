import { ANNOUNCEMENT_AUDIENCES } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { createAnnouncement } from "@/lib/actions/community";
import { audienceLabel } from "@/lib/queries/community-logic";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { AnnouncementForm } from "../announcement-form";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  await requirePermission("announcements.post");
  const audiences = ANNOUNCEMENT_AUDIENCES.map((a) => ({ value: a, label: audienceLabel(a) }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New announcement" eyebrow="Announcements" />
      <Card>
        <CardContent className="py-4">
          <AnnouncementForm action={createAnnouncement} audiences={audiences} submitLabel="Post" cancelHref="/announcements" />
        </CardContent>
      </Card>
    </div>
  );
}
