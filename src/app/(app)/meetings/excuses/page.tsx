import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import { getExcuseRequestsForMember, listPendingExcuses, listRecentExcuseDecisions } from "@/lib/queries/meetings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { ReviewExcuseForm } from "../_components/review-excuse-form";
import { WithdrawExcuseForm } from "../_components/small-forms";

export const metadata = { title: "Excuse requests" };

export default async function ExcusesPage() {
  const user = await requireUser();
  const manage = can(user, "meetings.manage");
  const mine = getExcuseRequestsForMember(user.id);
  const pending = manage ? listPendingExcuses() : [];
  const recent = manage ? listRecentExcuseDecisions(20) : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
        }
        title="Excuse requests"
        description={manage ? "Review pending requests. Approving after attendance was taken marks the brother excused." : "Ask to be excused from a meeting; an officer reviews it. Request one from the meeting itself."}
      />

      <div className="space-y-4">
        {manage ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pending review</CardTitle>
                <CardDescription>{pending.length === 0 ? "Nothing waiting." : `${pending.length} waiting, soonest meeting first.`}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {pending.length === 0 ? (
                <EmptyState title="No pending requests" className="m-4" />
              ) : (
                <ul className="divide-y divide-border">
                  {pending.map((r) => (
                    <li key={r.id} className="space-y-2 px-4 py-3" data-testid="pending-excuse">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <MemberLink member={r.member} />
                        <span className="text-muted">for</span>
                        <Link href={`/meetings/${r.meeting.id}`} className="font-medium hover:underline">
                          {r.meeting.title}
                        </Link>
                        <span className="text-muted">{formatDateTime(r.meeting.scheduledAt)}</span>
                        {r.meeting.attendanceTaken ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">attendance taken</span> : null}
                      </div>
                      <p className="text-sm">{r.reason}</p>
                      <p className="text-xs text-muted">Requested {formatDateTime(r.createdAt)}</p>
                      <ReviewExcuseForm requestId={r.id} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>My requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {mine.length === 0 ? (
              <EmptyState title="No excuse requests" description="Open an upcoming meeting and use Request excuse." className="m-4" />
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between" data-testid="my-excuse">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/meetings/${r.meeting.id}`} className="font-medium hover:underline">
                          {r.meeting.title}
                        </Link>
                        <span className="text-muted">{formatDateTime(r.meeting.scheduledAt)}</span>
                        <StatusPill status={r.status} />
                      </div>
                      <p>{r.reason}</p>
                      {r.reviewNote ? <p className="text-xs text-muted">Officer note: {r.reviewNote}</p> : null}
                      <p className="text-xs text-muted">
                        Requested {formatDateTime(r.createdAt)}
                        {r.reviewedAt ? ` · reviewed ${formatDateTime(r.reviewedAt)}` : ""}
                      </p>
                    </div>
                    {r.status === "pending" ? <WithdrawExcuseForm requestId={r.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {manage && recent.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent decisions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <MemberLink member={r.member} />
                      <Link href={`/meetings/${r.meeting.id}`} className="text-muted hover:underline">
                        {r.meeting.title}, {formatDateTime(r.meeting.scheduledAt)}
                      </Link>
                      <span className="w-full truncate text-xs text-muted sm:w-auto">{r.reason}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <StatusPill status={r.status} />
                      {r.reviewedBy ? <span>by {r.reviewedBy.preferredName}</span> : null}
                      {r.reviewNote ? <span className="truncate">{r.reviewNote}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
