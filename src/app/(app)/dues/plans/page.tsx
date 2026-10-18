import { ButtonLink, Card, ConfirmButton, EmptyState, PageHeader, StatusPill, SubmitButton, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { setPlanStatus } from "@/lib/actions/dues";
import { listPlans, type PlanRow } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";
import { ActionForm } from "../_components/action-form";

export const metadata = { title: "Payment plans" };

export default async function PlansPage() {
  await requirePermission("dues.manage");
  const plans = listPlans();
  return (
    <>
      <PageHeader
        title="Payment plans"
        description="Brothers paying in installments. Propose a plan from a brother's ledger, then approve it here or there."
        actions={
          <ButtonLink href="/dues" variant="ghost">
            Back to dues
          </ButtonLink>
        }
      />
      {plans.length === 0 ? (
        <EmptyState title="No payment plans" description="Open a brother's ledger and use Payment plan to propose one." />
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <Table>
                <THead>
                  <tr>
                    <Th>Brother</Th>
                    <Th>Period</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Paid</Th>
                    <Th>Next installment</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {plans.map((plan) => (
                    <Tr key={plan.id} data-testid={`plan-row-${plan.id}`}>
                      <Td>
                        <MemberLink member={plan.member} />
                      </Td>
                      <Td className="text-muted">{plan.period?.name ?? "No period"}</Td>
                      <Td className="text-right tabular-nums">{formatCents(plan.totalCents)}</Td>
                      <Td className="text-right tabular-nums">{plan.status === "approved" ? formatCents(plan.paidCents) : ""}</Td>
                      <Td className="whitespace-nowrap">
                        <NextInstallment plan={plan} />
                      </Td>
                      <Td>
                        <StatusPill status={plan.status} />
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <PlanActions plan={plan} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
          <ul className="space-y-2 md:hidden">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Card className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <MemberLink member={plan.member} />
                    <StatusPill status={plan.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {plan.period?.name ?? "No period"}: {formatCents(plan.totalCents)} in {plan.installments.length} installments
                  </p>
                  <p className="mt-1 text-sm">
                    <NextInstallment plan={plan} />
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <PlanActions plan={plan} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function NextInstallment({ plan }: { plan: PlanRow }) {
  if (plan.status !== "approved" && plan.status !== "proposed") return <span className="text-muted">-</span>;
  if (!plan.next) return <span className="text-success">All installments paid</span>;
  return (
    <span className={cn(plan.next.overdue && plan.status === "approved" ? "text-danger" : "")}>
      {formatCents(plan.next.remainingCents)} by {formatDate(plan.next.dueDate, { year: true })}
      {plan.next.overdue && plan.status === "approved" ? " (overdue)" : ""}
    </span>
  );
}

function PlanActions({ plan }: { plan: PlanRow }) {
  const open = plan.status === "proposed" || plan.status === "approved";
  return (
    <>
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
              Completed
            </SubmitButton>
          </ActionForm>
          <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "defaulted" }}>
            <ConfirmButton variant="outline" confirmText="Mark this plan as defaulted?">
              Defaulted
            </ConfirmButton>
          </ActionForm>
        </>
      ) : null}
      {open ? (
        <ActionForm action={setPlanStatus} fields={{ planId: plan.id, status: "cancelled" }}>
          <ConfirmButton variant="ghost" confirmText="Cancel this payment plan?">
            Cancel
          </ConfirmButton>
        </ActionForm>
      ) : null}
      <ButtonLink href={`/dues/members/${plan.member.id}`} size="sm" variant="ghost">
        Ledger
      </ButtonLink>
    </>
  );
}
