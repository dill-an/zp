import { ButtonLink, Card, EmptyState, PageHeader, StatusPill, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { listPeriods, type PeriodSummary } from "@/lib/queries/dues";
import { PeriodDialog } from "../_components/dialogs";

export const metadata = { title: "Dues periods" };

export default async function PeriodsPage() {
  await requirePermission("dues.manage");
  const periods = listPeriods();
  return (
    <>
      <PageHeader
        title="Dues periods"
        description="One period per semester. Set the amount and due date, then bill members to create their charges."
        actions={
          <>
            <PeriodDialog />
            <ButtonLink href="/dues" variant="ghost">
              Back to dues
            </ButtonLink>
          </>
        }
      />
      {periods.length === 0 ? (
        <EmptyState title="No periods yet" description="Create the first dues period to start billing." action={<PeriodDialog />} />
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <Table>
                <THead>
                  <tr>
                    <Th>Period</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">New members</Th>
                    <Th>Due</Th>
                    <Th className="text-right">Late fee</Th>
                    <Th className="text-right">Billed</Th>
                    <Th className="text-right">Collected</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {periods.map((p) => (
                    <Tr key={p.id} data-testid={`period-${p.id}`}>
                      <Td>
                        <span className="font-medium">{p.name}</span>
                        {p.isActive ? <StatusPill status="active" className="ml-2" /> : null}
                      </Td>
                      <Td className="text-right tabular-nums">{formatCents(p.amountCents)}</Td>
                      <Td className="text-right tabular-nums text-muted">{p.newMemberAmountCents == null ? "same" : formatCents(p.newMemberAmountCents)}</Td>
                      <Td className="whitespace-nowrap">{formatDate(p.dueDate, { year: true })}</Td>
                      <Td className="text-right tabular-nums">{formatCents(p.lateFeeCents)}</Td>
                      <Td className="text-right tabular-nums">
                        {formatCents(p.billedCents)}
                        <span className="ml-1 text-xs text-muted">({p.billedCount})</span>
                      </Td>
                      <Td className="text-right tabular-nums">{formatCents(p.collectedCents)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <PeriodActions period={p} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
          <ul className="space-y-2 md:hidden">
            {periods.map((p) => (
              <li key={p.id}>
                <Card className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.isActive ? <StatusPill status="active" /> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatCents(p.amountCents)} due {formatDate(p.dueDate, { year: true })}
                    {p.newMemberAmountCents != null ? `, new members ${formatCents(p.newMemberAmountCents)}` : ""}
                    {p.lateFeeCents > 0 ? `, late fee ${formatCents(p.lateFeeCents)}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Billed {formatCents(p.billedCents)} to {p.billedCount}, collected {formatCents(p.collectedCents)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <PeriodActions period={p} />
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

function PeriodActions({ period: p }: { period: PeriodSummary }) {
  return (
    <>
      <PeriodDialog
        period={{
          id: p.id,
          name: p.name,
          amountCents: p.amountCents,
          newMemberAmountCents: p.newMemberAmountCents,
          dueDate: p.dueDate,
          lateFeeCents: p.lateFeeCents,
          isActive: p.isActive,
          notes: p.notes,
        }}
        trigger="Edit"
        triggerVariant="outline"
        triggerSize="sm"
      />
      <ButtonLink href={`/dues/periods/${p.id}/bill`} size="sm">
        Bill members
      </ButtonLink>
      <ButtonLink href={`/dues/periods/${p.id}/late-fees`} size="sm" variant="outline">
        Late fees
      </ButtonLink>
      <ButtonLink href={`/dues?period=${p.id}`} size="sm" variant="ghost">
        View
      </ButtonLink>
    </>
  );
}
