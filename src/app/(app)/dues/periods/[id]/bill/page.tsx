import { notFound } from "next/navigation";
import { ButtonLink, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Stat, StatusPill, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { billPeriod } from "@/lib/actions/dues";
import { getBillPreview } from "@/lib/queries/dues";
import { RunForm } from "../../../_components/run-form";

export const metadata = { title: "Bill members" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("dues.manage");
  const { id } = await params;
  const periodId = Number(id);
  if (!Number.isInteger(periodId) || periodId <= 0) notFound();
  const preview = getBillPreview(periodId);
  if (!preview) notFound();
  const { period, toBill, alreadyBilled, totalCents } = preview;
  const amountIsZero = period.amountCents === 0;
  const canBill = !amountIsZero && toBill.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Bill members"
        title={period.name}
        description={`Adds a "${period.name} dues" charge due ${formatDate(period.dueDate, { year: true })} to every current brother who does not have one yet.`}
        actions={
          <ButtonLink href="/dues/periods" variant="ghost">
            Periods
          </ButtonLink>
        }
      />

      {amountIsZero ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          The dues amount for {period.name} is $0. Set it under Periods before billing.
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Amount" value={formatCents(period.amountCents)} hint={period.newMemberAmountCents != null ? `New members ${formatCents(period.newMemberAmountCents)}` : "Same for new members"} />
        <Stat label="To bill" value={toBill.length} hint={`${alreadyBilled.length} already billed`} />
        <Stat label="Total" value={formatCents(totalCents)} />
        <Stat label="Due" value={formatDate(period.dueDate)} />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Confirm</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted">
            {canBill
              ? `This creates ${toBill.length} charges totalling ${formatCents(totalCents)}. Brothers see them on their Dues page right away.`
              : toBill.length === 0
                ? "Everyone is already billed for this period. Nothing to do."
                : "Set the amount first."}
          </p>
          <RunForm action={billPeriod} periodId={period.id} label={canBill ? `Bill ${toBill.length} brothers ${formatCents(totalCents)}` : "Nothing to bill"} pendingText="Billing…" disabled={!canBill} cancelHref="/dues/periods" />
        </CardContent>
      </Card>

      {toBill.length === 0 ? (
        <EmptyState title="Nobody to bill" description="Every current brother already has a dues charge for this period." />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Brother</Th>
                <Th>Status</Th>
                <Th>Class</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </THead>
            <TBody>
              {toBill.map(({ member, amountCents }) => (
                <Tr key={member.id}>
                  <Td>
                    <MemberLink member={member} />
                  </Td>
                  <Td>
                    <StatusPill status={member.status} />
                  </Td>
                  <Td className="text-muted">{member.pledgeClass?.name ?? ""}</Td>
                  <Td className="text-right tabular-nums">{formatCents(amountCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
