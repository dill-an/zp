import Link from "next/link";
import { MAINTENANCE_STATUSES } from "@/db/schema";
import { Card, CardContent, ConfirmButton, StatusPill } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { deleteMaintenanceRequest } from "@/lib/actions/community";
import { relativeAge } from "@/lib/queries/community-logic";
import type { MaintenanceRow } from "@/lib/queries/community";
import { formatDate, formatDateTime } from "@/lib/dates";
import { AssignForm, StatusForm } from "./manage-forms";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

export function RequestCard({ request: r, manage, groups }: { request: MaintenanceRow; manage: boolean; groups: { label: string; members: M[] }[] }) {
  return (
    <Card data-request-id={r.id}>
      <CardContent className="space-y-2 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={r.priority} />
              <StatusPill status={r.status} />
            </div>
            <h3 className="mt-1 text-base font-semibold leading-tight">
              <Link href={`/maintenance/${r.id}`} className="hover:underline">
                {r.title}
              </Link>
            </h3>
            {r.location ? <p className="text-sm text-muted">{r.location}</p> : null}
          </div>
          <div className="text-right text-xs text-muted">
            <p title={formatDateTime(r.createdAt, { year: true })}>Reported {relativeAge(r.createdAt)}</p>
            {r.resolvedAt ? <p>Resolved {formatDate(r.resolvedAt, { year: true })}</p> : null}
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1">
            <dt className="text-muted">By</dt>
            <dd>{r.reporter ? <MemberLink member={r.reporter} /> : <span className="text-muted">Unknown</span>}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">Assigned</dt>
            <dd>{r.assignee ? <MemberLink member={r.assignee} /> : <span className="text-muted">Nobody yet</span>}</dd>
          </div>
        </dl>
        {manage ? (
          <details className="group border-t border-border pt-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted hover:text-text">Manage</summary>
            <div className="mt-2 space-y-3">
              <AssignForm requestId={r.id} groups={groups} current={r.assignedToId} compact />
              <StatusForm requestId={r.id} statuses={MAINTENANCE_STATUSES} current={r.status} notes={r.resolutionNotes} withNotes={false} compact />
              <form
                action={async () => {
                  "use server";
                  await deleteMaintenanceRequest(r.id);
                }}
              >
                <ConfirmButton confirmText={`Delete "${r.title}"?`} variant="ghost" size="sm" className="text-danger">
                  Delete request
                </ConfirmButton>
              </form>
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
