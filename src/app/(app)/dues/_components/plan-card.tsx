import { Card, CardContent, CardHeader, CardTitle, ConfirmButton, StatusPill, SubmitButton } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { setPlanStatus } from "@/lib/actions/dues";
import type { PlanDetail } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";
import { ActionForm } from "./action-form";

/** One payment plan: installments with paid / next / upcoming markers and, for the treasurer, status buttons. */
export function PlanCard({ plan, manage }: { plan: PlanDetail; manage: boolean }) {
  const open = plan.status === "proposed" || plan.status === "approved";
  let covered = plan.paidCents;
  return (
    <Card data-testid={`plan-${plan.id}`}>
      <CardHeader>
        <div>
          <CardTitle>Payment plan{plan.period ? `: ${plan.period.name}` : ""}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            {formatCents(plan.totalCents)} in {plan.installments.length} installments
            {plan.status === "approved" ? `, ${formatCents(plan.paidCents)} paid so far` : ""}
          </p>
        </div>
        <StatusPill status={plan.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-1 text-sm">
          {plan.installments.map((inst, i) => {
            const paid = covered >= inst.amountCents;
            const isNext = plan.next?.index === i;
            covered = Math.max(0, covered - inst.amountCents);
            return (
              <li key={i} className={cn("flex flex-wrap items-center justify-between gap-2", paid && plan.status === "approved" ? "text-muted line-through" : "")}>
                <span>
                  {formatDate(inst.dueDate, { year: true })}
                  {isNext && plan.status === "approved" ? <span className={cn("ml-2 text-xs font-medium", plan.next?.overdue ? "text-danger" : "text-info")}>{plan.next?.overdue ? "overdue" : "next"}</span> : null}
                </span>
                <span className="tabular-nums">{formatCents(inst.amountCents)}</span>
              </li>
            );
          })}
        </ol>
        {plan.notes ? <p className="text-sm text-muted">{plan.notes}</p> : null}
        {manage && open ? (
          <div className="flex flex-wrap gap-2">
            {plan.status === "proposed" ? (
              <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "approved" }}>
                <SubmitButton size="sm" pendingText="Approving…">
                  Approve
                </SubmitButton>
              </ActionForm>
            ) : null}
            {plan.status === "approved" ? (
              <>
                <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "completed" }}>
                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                    Mark completed
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "defaulted" }}>
                  <ConfirmButton variant="outline" confirmText="Mark this plan as defaulted?">
                    Mark defaulted
                  </ConfirmButton>
                </ActionForm>
              </>
            ) : null}
            <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "cancelled" }}>
              <ConfirmButton variant="ghost" confirmText="Cancel this payment plan?">
                Cancel plan
              </ConfirmButton>
            </ActionForm>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
