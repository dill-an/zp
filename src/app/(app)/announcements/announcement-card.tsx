import { Badge, Button, ButtonLink, Card, CardContent, ConfirmButton } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { deleteAnnouncement, toggleAnnouncementPin } from "@/lib/actions/community";
import { audienceLabel, bodyParagraphs, relativeAge } from "@/lib/queries/community-logic";
import type { AnnouncementRow } from "@/lib/queries/community";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function AnnouncementCard({ announcement: a, canEdit }: { announcement: AnnouncementRow; canEdit: boolean }) {
  const paragraphs = bodyParagraphs(a.body);
  return (
    <Card className={cn(a.isPinned && "border-primary/40")} data-announcement-id={a.id}>
      <CardContent className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {a.isPinned ? <Badge tone="primary">Pinned</Badge> : null}
          {a.audience !== "all" ? <Badge tone="info">{audienceLabel(a.audience)}</Badge> : null}
          {a.expired ? <Badge tone="neutral">Expired</Badge> : a.expiresAt ? <Badge tone="neutral">Until {formatDate(a.expiresAt)}</Badge> : null}
          {!a.visibleToViewer && !a.expired ? <Badge tone="warning">Not shown to you normally</Badge> : null}
        </div>
        <h2 className="text-base font-semibold leading-tight">{a.title}</h2>
        <div className="space-y-2 text-sm">
          {paragraphs.map((lines, i) => (
            <p key={i}>
              {lines.map((line, j) => (
                <span key={j}>
                  {j > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
          ))}
        </div>
        <p className="text-xs text-muted">
          {a.author ? <MemberLink member={a.author} className="font-medium" /> : "Unknown"} <span title={formatDateTime(a.createdAt, { year: true })}>{relativeAge(a.createdAt)}</span>
          {a.updatedAt !== a.createdAt ? <span> (edited {relativeAge(a.updatedAt)})</span> : null}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <form
              action={async () => {
                "use server";
                await toggleAnnouncementPin(a.id);
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                {a.isPinned ? "Unpin" : "Pin"}
              </Button>
            </form>
            <ButtonLink href={`/announcements/${a.id}/edit`} variant="outline" size="sm">
              Edit
            </ButtonLink>
            <form
              action={async () => {
                "use server";
                await deleteAnnouncement(a.id);
              }}
            >
              <ConfirmButton confirmText={`Delete "${a.title}"?`} variant="ghost" size="sm" className="text-danger">
                Delete
              </ConfirmButton>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
