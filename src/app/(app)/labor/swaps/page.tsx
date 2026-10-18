import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { acceptSwap, approveSwap, cancelSwap, declineSwap } from "@/lib/actions/labor";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { can } from "@/lib/permissions";
import { listSwapRequests, type SwapRequestDetail } from "@/lib/queries/labor";
import { ActionForm } from "../_components/action-form";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "Swaps | Labor" };

function SwapRow({ r, children }: { r: SwapRequestDetail; children?: React.ReactNode }) {
  const a = r.assignment;
  return (
    <li className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between" data-swap={r.id}>
      <div className="min-w-0 space-y-0.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/labor/week/${a.weekStart}`} className="font-medium hover:underline">
            {a.jobType.name}
          </Link>
          <span className="text-muted">week of {formatDate(a.weekStart)}</span>
          <StatusPill status={r.status} label={r.status === "accepted" ? "Awaiting approval" : undefined} />
        </div>
        <p className="text-xs text-muted">
          <MemberLink member={r.requestedBy} short className="font-normal" /> asked{" "}
          {r.targetMember ? (
            <>
              <MemberLink member={r.targetMember} short className="font-normal" />
              {r.status === "accepted" ? " (accepted)" : ""}
            </>
          ) : (
            "anyone"
          )}{" "}
          on {formatDateTime(r.createdAt)}
          {r.reason ? ` · "${r.reason}"` : ""}
          {r.resolvedBy ? ` · ${r.status} by ${displayName(r.resolvedBy)}` : ""}
        </p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">{children}</div> : null}
    </li>
  );
}

function Section({ title, hint, items, render }: { title: string; hint?: string; items: SwapRequestDetail[]; render: (r: SwapRequestDetail) => React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">
        {title} <span className="text-sm font-normal text-muted">({items.length})</span>
      </h2>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {items.length ? <ul className="divide-y divide-border rounded-lg border border-border bg-surface">{items.map(render)}</ul> : <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">Nothing here.</p>}
    </section>
  );
}

export default async function SwapsPage() {
  const user = await requireUser();
  const manager = can(user, "labor.manage");
  const all = listSwapRequests();
  const mine = all.filter((r) => r.requestedById === user.id);
  const forMe = all.filter((r) => r.targetMemberId === user.id && r.requestedById !== user.id && r.status === "pending");
  const open = all.filter((r) => r.targetMemberId == null && r.status === "pending" && r.requestedById !== user.id);
  const pendingAll = all.filter((r) => r.status === "pending" || r.status === "accepted");
  const recent = all.filter((r) => r.status === "approved" || r.status === "declined" || r.status === "cancelled").slice(0, 20);

  return (
    <>
      <PageHeader title="Swaps" description="Trade a job with another brother. Request one from My jobs; a labor manager confirms the switch." />
      <LaborTabs user={user} active="/labor/swaps" />
      {all.length === 0 ? (
        <EmptyState title="No swap requests" description="Open a job under My jobs and press Request swap to start one." action={<Link href="/labor/me" className="text-sm underline">Go to My jobs</Link>} />
      ) : (
        <div className="space-y-6">
          <Section
            title="Requests for me"
            items={forMe}
            render={(r) => (
              <SwapRow key={r.id} r={r}>
                <ActionForm action={acceptSwap} hidden={{ swapId: r.id }}>
                  <SubmitButton size="sm" pendingText="Saving…">
                    Accept
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={declineSwap} hidden={{ swapId: r.id }}>
                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                    Decline
                  </SubmitButton>
                </ActionForm>
              </SwapRow>
            )}
          />
          <Section
            title="Open requests"
            hint="Anyone can claim these."
            items={open}
            render={(r) => (
              <SwapRow key={r.id} r={r}>
                <ActionForm action={acceptSwap} hidden={{ swapId: r.id }}>
                  <SubmitButton size="sm" pendingText="Saving…">
                    Claim this job
                  </SubmitButton>
                </ActionForm>
              </SwapRow>
            )}
          />
          <Section
            title="My requests"
            items={mine}
            render={(r) => (
              <SwapRow key={r.id} r={r}>
                {r.status === "pending" || r.status === "accepted" ? (
                  <ActionForm action={cancelSwap} hidden={{ swapId: r.id }}>
                    <ConfirmButton variant="outline" size="sm" confirmText="Cancel this swap request?">
                      Cancel request
                    </ConfirmButton>
                  </ActionForm>
                ) : null}
              </SwapRow>
            )}
          />
          {manager ? (
            <Section
              title="Pending approval"
              hint="Approving moves the job to the accepting brother. Open requests need a taker first."
              items={pendingAll}
              render={(r) => (
                <SwapRow key={r.id} r={r}>
                  <ActionForm action={approveSwap} hidden={{ swapId: r.id }}>
                    <SubmitButton size="sm" disabled={r.targetMemberId == null} pendingText="Saving…">
                      Approve
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={declineSwap} hidden={{ swapId: r.id }}>
                    <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                      Decline
                    </SubmitButton>
                  </ActionForm>
                </SwapRow>
              )}
            />
          ) : null}
          {recent.length ? <Section title="Recent decisions" items={recent} render={(r) => <SwapRow key={r.id} r={r} />} /> : null}
        </div>
      )}
    </>
  );
}
