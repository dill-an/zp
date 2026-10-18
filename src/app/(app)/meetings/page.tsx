import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MEETING_KINDS, type MeetingKind } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { countPendingExcuses, getMyExcusesByMeeting, listMeetings } from "@/lib/queries/meetings";
import { MEETING_KIND_LABELS } from "@/lib/queries/meetings-logic";
import { Badge, ButtonLink, Card, EmptyState, LinkTabs, PageHeader, StatusPill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CountsInline, DateBlock, MandatoryBadge, MeetingKindBadge } from "./_components/meeting-bits";
import { ExcuseDialog } from "./_components/excuse-dialog";
import { DeleteMeetingForm } from "./_components/small-forms";

export const metadata = { title: "Meetings" };

type KindFilter = MeetingKind | "all";
const isKind = (v: string | undefined): v is MeetingKind => !!v && (MEETING_KINDS as readonly string[]).includes(v);

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = sp.tab === "past" ? "past" : "upcoming";
  const kind: KindFilter = isKind(sp.kind) ? sp.kind : "all";
  const manage = can(user, "meetings.manage");

  const list = listMeetings({ scope, kind });
  const myExcuses = getMyExcusesByMeeting(user.id, list.map((m) => m.id));
  const pending = manage ? countPendingExcuses() : 0;

  const href = (tab: "upcoming" | "past", k: KindFilter) => `/meetings?tab=${tab}${k === "all" ? "" : `&kind=${k}`}`;
  const kinds: KindFilter[] = ["all", ...MEETING_KINDS];

  return (
    <>
      <PageHeader
        title="Meetings"
        description="House meetings, attendance and excuse requests."
        actions={
          <>
            <ButtonLink variant="outline" size="sm" href="/meetings/attendance">
              Attendance grid
            </ButtonLink>
            <ButtonLink variant="outline" size="sm" href="/meetings/excuses">
              Excuses
              {pending > 0 ? <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning">{pending}</span> : null}
            </ButtonLink>
            {manage ? (
              <ButtonLink size="sm" href="/meetings/new">
                New meeting
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <LinkTabs
        tabs={[
          { href: href("upcoming", kind), label: "Upcoming" },
          { href: href("past", kind), label: "Past" },
        ]}
        active={href(scope, kind)}
      />

      <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by kind">
        {kinds.map((k) => (
          <Link
            key={k}
            href={href(scope, k)}
            aria-current={k === kind ? "true" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              k === kind ? "border-primary bg-primary-soft text-primary-strong" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {k === "all" ? "All kinds" : MEETING_KIND_LABELS[k]}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={scope === "upcoming" ? "No upcoming meetings" : "No past meetings"}
          description={scope === "upcoming" ? "Nothing scheduled yet." : "Past meetings show up here with their attendance."}
          action={manage && scope === "upcoming" ? <ButtonLink href="/meetings/new">Schedule a meeting</ButtonLink> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((m, i) => {
              const excuse = myExcuses.get(m.id);
              const isNext = scope === "upcoming" && i === 0 && kind === "all";
              return (
                <li key={m.id} className="flex gap-3 px-4 py-3" data-testid="meeting-row">
                  <DateBlock iso={m.scheduledAt} muted={scope === "past"} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/meetings/${m.id}`} className="font-medium hover:underline">
                          {m.title}
                        </Link>
                        <MeetingKindBadge kind={m.kind} />
                        <MandatoryBadge isMandatory={m.isMandatory} />
                        {isNext ? <Badge tone="success">Next</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {formatDateTime(m.scheduledAt)}
                        {m.location ? ` · ${m.location}` : ""}
                      </p>
                      <div className="mt-1">
                        {scope === "past" || m.attendanceTaken ? (
                          m.counts ? (
                            <CountsInline counts={m.counts} />
                          ) : (
                            <span className="text-xs text-muted">Attendance not taken</span>
                          )
                        ) : excuse ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            My excuse <StatusPill status={excuse.status} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      {scope === "upcoming" ? (
                        <ExcuseDialog meetingId={m.id} meetingLabel={`${m.title}, ${formatDateTime(m.scheduledAt)}`} canRequest={!excuse || excuse.status === "denied"} />
                      ) : null}
                      {manage ? (
                        <>
                          <ButtonLink variant={m.attendanceTaken ? "outline" : "secondary"} size="sm" href={`/meetings/${m.id}/attendance`}>
                            {m.attendanceTaken ? "Edit attendance" : "Take attendance"}
                          </ButtonLink>
                          <ButtonLink variant="ghost" size="sm" href={`/meetings/${m.id}/edit`}>
                            Edit
                          </ButtonLink>
                          <DeleteMeetingForm meetingId={m.id} />
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
