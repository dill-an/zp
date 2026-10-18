import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { reviewExcuse } from "@/lib/actions/labor";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { listExcuseRequests, type ExcuseRequestDetail } from "@/lib/queries/labor";
import { ActionForm } from "../_components/action-form";
import { LaborTabs } from "../_components/labor-tabs";
import { AssignmentStatePill } from "../_components/state-pill";

export const metadata = { title: "Excuses | Labor" };

function Row({ r, children }: { r: ExcuseRequestDetail; children?: React.ReactNode }) {
  const a = r.assignment;
  return (
    <li className="flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between" data-excuse={r.id}>
      <div className="min-w-0 space-y-0.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <MemberLink member={r.member} short />
          <Link href={`/labor/week/${a.weekStart}`} className="font-medium hover:underline">
            {a.jobType.name}
          </Link>
          <span className="text-muted">week of {formatDate(a.weekStart)}</span>
          <AssignmentStatePill state={a.state} />
          <StatusPill status={r.status} />
        </div>
        <p className="text-xs text-muted">
          &quot;{r.reason}&quot; · asked {formatDateTime(r.createdAt)}
          {r.reviewedBy ? ` · ${r.status} by ${displayName(r.reviewedBy)}${r.reviewNote ? `: ${r.reviewNote}` : ""}` : ""}
        </p>
      </div>
      {children}
    </li>
  );
}

export default async function ExcusesPage() {
  const user = await requirePermission("labor.manage");
  const all = listExcuseRequests();
  const pending = all.filter((r) => r.status === "pending");
  const reviewed = all.filter((r) => r.status !== "pending").slice(0, 30);
  return (
    <>
      <PageHeader title="Excuse requests" description="Brothers asking to be let off a job. Approving marks the job excused; it no longer counts against them." />
      <LaborTabs user={user} active="/labor/excuses" />
      {all.length === 0 ? (
        <EmptyState title="No excuse requests" description="Requests brothers make from My jobs show up here." />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              Pending <span className="text-sm font-normal text-muted">({pending.length})</span>
            </h2>
            {pending.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {pending.map((r) => (
                  <Row key={r.id} r={r}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ActionForm action={reviewExcuse} hidden={{ excuseId: r.id, decision: "approve" }}>
                        <Input name="note" placeholder="Note (optional)" aria-label="Review note" className="h-8 w-40 text-xs" />
                        <SubmitButton size="sm" pendingText="Saving…">
                          Approve
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={reviewExcuse} hidden={{ excuseId: r.id, decision: "deny" }}>
                        <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                          Deny
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  </Row>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">Nothing waiting.</p>
            )}
          </section>
          {reviewed.length ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Reviewed</h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {reviewed.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
