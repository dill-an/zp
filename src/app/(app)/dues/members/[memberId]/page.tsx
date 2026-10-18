import { notFound, redirect } from "next/navigation";
import { Badge, ButtonLink, Card, ConfirmButton, EmptyState, LinkTabs, PageHeader, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, isoToLocalInput, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { deleteCharge, deletePayment } from "@/lib/actions/dues";
import { getActivePeriod, getMemberBalance, getMemberLedger, getMemberPeriodRows, listPeriods } from "@/lib/queries/dues";
import { buildLedger, inPeriod, statusLabel, statusTone, type LedgerEntry } from "@/lib/queries/dues-logic";
import { cn } from "@/lib/utils";
import { ActionForm } from "../../_components/action-form";
import { methodLabel } from "../../_components/constants";
import { ChargeDialog, PaymentDialog, PlanDialog } from "../../_components/dialogs";
import { Balance, DuesStatusPill, KindBadge, Money } from "../../_components/display";
import { PlanCard } from "../../_components/plan-card";
import type { PlanScope } from "../../_components/plan-form";

export const metadata = { title: "Dues ledger" };

type Params = Promise<{ memberId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LedgerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { memberId: raw } = await params;
  const sp = await searchParams;
  const memberId = Number(raw);
  if (!Number.isInteger(memberId) || memberId <= 0) notFound();
  const user = await requireUser();
  const manage = can(user, "dues.manage");
  if (!manage && user.id !== memberId) redirect("/dues");

  const ledger = getMemberLedger(memberId);
  if (!ledger) notFound();
  const { member } = ledger;
  const isSelf = user.id === memberId;
  const scopeParam = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const scope: number | null | undefined = scopeParam === "none" ? null : scopeParam && scopeParam !== "all" && ledger.periods.some((p) => String(p.id) === scopeParam) ? Number(scopeParam) : undefined;
  const balance = getMemberBalance(memberId, scope);
  const periodRows = getMemberPeriodRows(memberId);
  const allPeriods = listPeriods();
  const activePeriod = getActivePeriod();
  const today = todayISO();
  const periodOptions = allPeriods.map((p) => ({ id: p.id, name: p.name }));
  const periodName = (id: number | null) => (id == null ? null : (allPeriods.find((p) => p.id === id)?.name ?? null));

  const entries = buildLedger(
    ledger.charges.filter((c) => inPeriod(c, scope)),
    ledger.payments.filter((p) => inPeriod(p, scope)),
  ).reverse();

  const scopes: PlanScope[] = periodRows.map((r) => ({ periodId: r.period?.id ?? null, name: r.period?.name ?? "Other charges", balanceCents: r.balanceCents }));
  const openPlans = ledger.plans.filter((p) => p.status === "proposed" || p.status === "approved");
  const closedPlans = ledger.plans.filter((p) => !openPlans.includes(p));
  const tabs = [
    { href: `/dues/members/${memberId}?period=all`, label: "All" },
    ...ledger.periods.map((p) => ({ href: `/dues/members/${memberId}?period=${p.id}`, label: p.name })),
    ...(ledger.hasUnassigned ? [{ href: `/dues/members/${memberId}?period=none`, label: "No period" }] : []),
  ];
  const activeTab = scope === undefined ? tabs[0].href : scope === null ? `/dues/members/${memberId}?period=none` : `/dues/members/${memberId}?period=${scope}`;

  return (
    <>
      <PageHeader
        eyebrow="Dues ledger"
        title={displayName(member)}
        description={[member.pledgeClass?.name, member.status.replace("_", " ")].filter(Boolean).join(" · ")}
        actions={
          <>
            {manage ? (
              <>
                <PaymentDialog memberId={member.id} memberName={displayName(member)} periods={periodOptions} defaultPeriodId={activePeriod?.id ?? null} today={today} />
                <ChargeDialog
                  memberId={member.id}
                  memberName={displayName(member)}
                  periods={periodOptions}
                  defaultPeriodId={activePeriod?.id ?? null}
                  defaultDueDate={activePeriod?.dueDate ?? null}
                />
                <PlanDialog memberId={member.id} memberName={displayName(member)} scopes={scopes} />
              </>
            ) : null}
            <ButtonLink href="/dues" variant="ghost">
              {isSelf ? "My dues" : "All dues"}
            </ButtonLink>
          </>
        }
      />

      <LinkTabs tabs={tabs} active={activeTab} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Charged" value={formatCents(balance.chargedCents)} />
        <Stat label="Paid" value={formatCents(balance.paidCents)} tone="success" />
        <Stat
          label={balance.balanceCents < 0 ? "Credit" : "Balance"}
          value={formatCents(Math.abs(balance.balanceCents))}
          tone={statusTone(balance.status)}
          hint={balance.balanceCents > 0 && balance.nextDueDate ? `Due ${formatDate(balance.nextDueDate, { year: true })}` : undefined}
        />
        <Stat label="Status" value={<DuesStatusPill status={balance.status} className="text-sm" />} hint={statusLabel(balance.status) === "Nothing due" ? "No charges in this view" : undefined} />
      </div>

      {openPlans.length > 0 || closedPlans.length > 0 ? (
        <div className="mb-5 space-y-3">
          {openPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} manage={manage} />
          ))}
          {closedPlans.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted">
                {closedPlans.length} past {closedPlans.length === 1 ? "plan" : "plans"}
              </summary>
              <div className="mt-2 space-y-3">
                {closedPlans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} manage={manage} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title="No charges or payments" description={isSelf ? "Nothing has been billed to you yet." : "Nothing has been billed to this brother yet."} />
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <Table>
                <THead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Description</Th>
                    <Th>Period</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Due</Th>
                    <Th className="text-right">Balance</Th>
                    {manage ? <Th className="text-right">Actions</Th> : null}
                  </tr>
                </THead>
                <TBody>
                  {entries.map((e) => (
                    <Tr key={`${e.type}-${e.id}`} data-testid={`ledger-${e.type}-${e.id}`}>
                      <Td className="whitespace-nowrap">{formatDate(e.at)}</Td>
                      <Td>{e.type === "charge" ? <KindBadge kind={e.detail ?? "other"} /> : <Badge tone="success">Payment</Badge>}</Td>
                      <Td>{e.type === "charge" ? e.label : paymentLabel(e)}</Td>
                      <Td className="text-muted">{periodName(e.periodId) ?? ""}</Td>
                      <Td className="text-right">
                        <Money cents={e.deltaCents} signed />
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{e.dueDate ? formatDate(e.dueDate) : ""}</Td>
                      <Td className="text-right">
                        <Balance cents={e.runningBalanceCents} />
                      </Td>
                      {manage ? (
                        <Td>
                          <div className="flex justify-end gap-1">
                            <RowActions entry={e} ledger={ledger} periodOptions={periodOptions} today={today} />
                          </div>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
          <ul className="space-y-2 md:hidden">
            {entries.map((e) => (
              <li key={`${e.type}-${e.id}`}>
                <Card className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      {e.type === "charge" ? <KindBadge kind={e.detail ?? "other"} /> : <Badge tone="success">Payment</Badge>}
                      <span className="text-muted">{formatDate(e.at)}</span>
                    </span>
                    <Money cents={e.deltaCents} signed className="font-medium" />
                  </div>
                  <p className="mt-1 text-sm">{e.type === "charge" ? e.label : paymentLabel(e)}</p>
                  <p className={cn("mt-1 text-xs text-muted")}>
                    {[periodName(e.periodId), e.dueDate ? `due ${formatDate(e.dueDate)}` : null].filter(Boolean).join(" · ")}
                    {" · "}balance after: {formatCents(e.runningBalanceCents)}
                  </p>
                  {manage ? (
                    <div className="mt-2 flex gap-1">
                      <RowActions entry={e} ledger={ledger} periodOptions={periodOptions} today={today} />
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function paymentLabel(e: LedgerEntry): string {
  const [method, ...rest] = (e.detail ?? "").split(" ");
  const ref = rest.join(" ");
  return ref ? `${methodLabel(method)} (${ref})` : methodLabel(method);
}

function RowActions({
  entry,
  ledger,
  periodOptions,
  today,
}: {
  entry: LedgerEntry;
  ledger: NonNullable<ReturnType<typeof getMemberLedger>>;
  periodOptions: { id: number; name: string }[];
  today: string;
}) {
  if (entry.type === "charge") {
    const charge = ledger.charges.find((c) => c.id === entry.id);
    if (!charge) return null;
    return (
      <>
        <ChargeDialog
          memberId={ledger.member.id}
          periods={periodOptions}
          defaultPeriodId={charge.periodId}
          defaultDueDate={charge.dueDate}
          charge={{ id: charge.id, kind: charge.kind, description: charge.description, amountCents: charge.amountCents, dueDate: charge.dueDate, periodId: charge.periodId }}
          trigger="Edit"
          triggerVariant="ghost"
          triggerSize="sm"
        />
        <ActionForm action={deleteCharge} fields={{ chargeId: charge.id }}>
          <ConfirmButton variant="ghost" confirmText={`Delete this ${formatCents(charge.amountCents)} charge?`} className="text-danger">
            Delete
          </ConfirmButton>
        </ActionForm>
      </>
    );
  }
  const payment = ledger.payments.find((p) => p.id === entry.id);
  if (!payment) return null;
  return (
    <>
      <PaymentDialog
        memberId={ledger.member.id}
        periods={periodOptions}
        defaultPeriodId={payment.periodId}
        today={today}
        payment={{
          id: payment.id,
          amountCents: payment.amountCents,
          method: payment.method,
          paidOn: isoToLocalInput(payment.paidAt).slice(0, 10),
          periodId: payment.periodId,
          reference: payment.reference,
          notes: payment.notes,
        }}
        trigger="Edit"
        triggerVariant="ghost"
        triggerSize="sm"
      />
      <ActionForm action={deletePayment} fields={{ paymentId: payment.id }}>
        <ConfirmButton variant="ghost" confirmText={`Delete this ${formatCents(payment.amountCents)} payment?`} className="text-danger">
          Delete
        </ConfirmButton>
      </ActionForm>
    </>
  );
}
