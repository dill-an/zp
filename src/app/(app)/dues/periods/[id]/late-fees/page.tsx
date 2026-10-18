import { notFound } from "next/navigation";
import { ButtonLink, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { requirePermission } from "@/lib/auth";
import { dueDescription, formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { applyLateFees } from "@/lib/actions/dues";
import { getLateFeePreview } from "@/lib/queries/dues";
import { RunForm } from "../../../_components/run-form";

export const metadata = { title: "Apply late fees" };

export default async function LateFeesPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("dues.manage");
  const { id } = await params;
  const periodId = Number(id);
  if (!Number.isInteger(periodId) || periodId <= 0) notFound();
  const preview = getLateFeePreview(periodId);
  if (!preview) notFound();
  const { period, toCharge, alreadyCharged, notYetDue, totalCents, isPastDue } = preview;
  const noFee = period.lateFeeCents <= 0;
  const canRun = !noFee && isPastDue && toCharge.length > 0;
  const blocker = noFee
    ? `${period.name} has no late fee set. Set one under Periods first.`
    : !isPastDue
      ? `${period.name} is not past due yet (${dueDescription(period.dueDate)}). Late fees can be applied from the day after the due date.`
      : toCharge.length === 0
        ? notYetDue.length > 0
          ? "Nobody needs a late fee: everyone who is overdue already has one, and the rest are not late yet."
          : "Nobody needs a late fee: everyone who still owes money already has one."
        : null;

  return (
    <>
      <PageHeader
        eyebrow="Apply late fees"
        title={period.name}
        description={`Adds a ${formatCents(period.lateFeeCents)} late fee to every current brother who is overdue for ${period.name} after ${formatDate(period.dueDate, { year: true })} and has not been charged one yet. A brother on an approved payment plan is only charged once an installment is late.`}
        actions={
          <ButtonLink href="/dues/periods" variant="ghost">
            Periods
          </ButtonLink>
        }
      />

      {blocker ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {blocker}
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Late fee" value={formatCents(period.lateFeeCents)} />
        <Stat label="Due date" value={formatDate(period.dueDate)} hint={dueDescription(period.dueDate)} />
        <Stat label="To charge" value={toCharge.length} hint={`${alreadyCharged.length} already charged${notYetDue.length > 0 ? `, ${notYetDue.length} not yet due` : ""}`} />
        <Stat label="Total" value={formatCents(totalCents)} />
      </div>

      {notYetDue.length > 0 ? (
        <p role="status" className="mb-4 rounded-md bg-info-soft px-3 py-2 text-sm text-info" data-testid="late-fee-not-yet-due">
          Not charged (still owing, but nothing is late yet):{" "}
          {notYetDue.map((r) => `${displayName(r.member)} (${formatCents(r.balanceCents)}${r.nextDueDate ? `, next due ${formatDate(r.nextDueDate)}` : ""})`).join(", ")}.
        </p>
      ) : null}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Confirm</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted">
            {canRun ? `This adds ${toCharge.length} late fee charges totalling ${formatCents(totalCents)}.` : "Nothing will be charged."}
          </p>
          <RunForm
            action={applyLateFees}
            periodId={period.id}
            label={canRun ? `Apply ${toCharge.length} late fees ${formatCents(totalCents)}` : "Nothing to apply"}
            pendingText="Applying…"
            disabled={!canRun}
            cancelHref="/dues/periods"
          />
        </CardContent>
      </Card>

      {toCharge.length === 0 ? (
        <EmptyState title="Nobody to charge" description="No current brother is overdue for this period without a late fee." />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Brother</Th>
                <Th>Class</Th>
                <Th className="text-right">Still owes</Th>
                <Th className="text-right">Late fee</Th>
              </tr>
            </THead>
            <TBody>
              {toCharge.map(({ member, balanceCents }) => (
                <Tr key={member.id}>
                  <Td>
                    <MemberLink member={member} />
                  </Td>
                  <Td className="text-muted">{member.pledgeClass?.name ?? ""}</Td>
                  <Td className="text-right tabular-nums text-danger">{formatCents(balanceCents)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(period.lateFeeCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
