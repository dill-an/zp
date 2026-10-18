import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAnnouncements } from "@/lib/queries/community";
import { ButtonLink, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { AnnouncementCard } from "./announcement-card";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const poster = can(user, "announcements.post");
  const all = poster && sp.all === "1";
  const list = listAnnouncements(user, { all });

  return (
    <>
      <PageHeader
        title="Announcements"
        description={all ? "Everything ever posted, including expired posts and other audiences." : "House news for you. Pinned posts stay on top."}
        actions={poster ? <ButtonLink href="/announcements/new">New announcement</ButtonLink> : undefined}
      />
      {poster ? (
        <LinkTabs
          tabs={[
            { href: "/announcements", label: "For me" },
            { href: "/announcements?all=1", label: "All posts" },
          ]}
          active={all ? "/announcements?all=1" : "/announcements"}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          title="No announcements"
          description={poster ? "Post the first one." : "Nothing for you right now. Check back after the next house meeting."}
          action={poster ? <ButtonLink href="/announcements/new">New announcement</ButtonLink> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} canEdit={poster && (user.role === "admin" || a.authorId === user.id)} />
          ))}
        </div>
      )}
    </>
  );
}
