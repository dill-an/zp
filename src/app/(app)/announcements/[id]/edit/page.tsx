import { notFound, redirect } from "next/navigation";
import { ANNOUNCEMENT_AUDIENCES } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { getAnnouncement } from "@/lib/queries/community";
import { updateAnnouncement } from "@/lib/actions/community";
import { audienceLabel } from "@/lib/queries/community-logic";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { AnnouncementForm } from "../../announcement-form";

export const metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("announcements.post");
  const { id: idParam } = await params;
  const id = Number(idParam);
  const a = Number.isInteger(id) ? getAnnouncement(id, user) : null;
  if (!a) notFound();
  if (user.role !== "admin" && a.authorId !== user.id) redirect("/announcements");
  const audiences = ANNOUNCEMENT_AUDIENCES.map((v) => ({ value: v, label: audienceLabel(v) }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit announcement" eyebrow={a.title} />
      <Card>
        <CardContent className="py-4">
          <AnnouncementForm
            action={updateAnnouncement.bind(null, a.id)}
            audiences={audiences}
            initial={{ title: a.title, body: a.body, audience: a.audience, isPinned: a.isPinned, expiresAt: a.expiresAt?.slice(0, 10) ?? "" }}
            submitLabel="Save changes"
            cancelHref="/announcements"
          />
        </CardContent>
      </Card>
    </div>
  );
}
