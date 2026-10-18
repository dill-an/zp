import { Button, ButtonLink, Card, EmptyState, Input, LinkTabs, PageHeader, Select, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { formatDate, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { listPledgeClasses } from "@/lib/queries/common";
import { getActivePeriod, getBalances, getPeriodStats, listPeriods, type BalanceRow } from "@/lib/queries/dues";
import { STATUS_FILTERS } from "./constants";
import { ChargeDialog, PaymentDialog } from "./dialogs";
import { Balance, DuesStatusPill, Money } from "./display";

export function TreasurerDashboard({
  periodParam,
  status,
  classFilter,
  q,
  billed,
  total,
  lateFees,
}: {
  periodParam?: string;
  status?: string;
  classFilter?: string;
  q?: string;
  billed?: string;
  total?: string;
  lateFees?: string;
}) {
  const periods = listPeriods();
  const active = getActivePeriod();
  const selected = periodParam === "all" ? null : periodParam ? (periods.find((p) => String(p.id) === periodParam) ?? active) : active;
  const periodId = selected ? selected.id : undefined;
  const stats = getPeriodStats(periodId);
  const rows = getBalances(periodId);
  const classes = listPledgeClasses();
  const today = todayISO();
  const periodOptions = periods.map((p) => ({ id: p.id, name: p.name }));
  const statusFilter = status && STATUS_FILTERS.some((s) => s.value === status) ? status : "all";
  const query = (q ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (classFilter && String(r.member.pledgeClassId ?? "") !== classFilter) return false;
    if (query && !`${displayName(r.member)} ${r.member.firstName} ${r.member.lastName} ${r.member.username}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const periodQuery = selected ? `period=${selected.id}` : "period=all";
  const hasFilters = statusFilter !== "all" || !!classFilter || !!query;
  const billedCount = Number(billed);
  const lateFeeCount = Number(lateFees);

  return (
    <>
      <PageHeader
        title="Dues"
        description={selected ? `${selected.name}: due ${formatDate(selected.dueDate, { year: true })}, ${formatCents(selected.amountCents)} per brother.` : "Every period together."}
        actions={
          <>
            {selected ? (
              <ButtonLink href={`/dues/periods/${selected.id}/bill`} size="sm">
                Bill members
              </ButtonLink>
            ) : null}
            {selected ? (
              <ButtonLink href={`/dues/periods/${selected.id}/late-fees`} size="sm" variant="outline">
                Apply late fees
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/dues/export?${periodQuery}`} size="sm" variant="outline" prefetch={false}>
              Export CSV
            </ButtonLink>
            <ButtonLink href="/dues/periods" size="sm" variant="outline">
              Periods
            </ButtonLink>
            <ButtonLink href="/dues/plans" size="sm" variant="outline">
              Plans
            </ButtonLink>
          </>
        }
      />

      {billedCount > 0 ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success" data-testid="bill-notice">
          Billed {billedCount} {billedCount === 1 ? "member" : "members"}
          {Number(total) > 0 ? ` for ${formatCents(Number(total))}` : ""}.
        </p>
      ) : null}
      {lateFeeCount > 0 ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success" data-testid="late-fee-notice">
          Applied late fees to {lateFeeCount} {lateFeeCount === 1 ? "member" : "members"}.
        </p>
      ) : null}

      {periods.length === 0 ? (
        <EmptyState
          title="No dues periods yet"
          description="Create a period (for example Fall 2026) with the amount and due date, then bill members."
          action={<ButtonLink href="/dues/periods">Set up periods</ButtonLink>}
        />
      ) : (
        <>
          <LinkTabs
            tabs={[...periods.map((p) => ({ href: `/dues?period=${p.id}`, label: p.isActive ? `${p.name} (active)` : p.name })), { href: "/dues?period=all", label: "All periods" }]}
            active={selected ? `/dues?period=${selected.id}` : "/dues?period=all"}
          />

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Billed" value={formatCents(stats.billedCents)} hint={`${stats.billedCount} of ${stats.memberCount} brothers`} />
            <Stat label="Collected" value={formatCents(stats.collectedCents)} tone="success" />
            <Stat label="Outstanding" value={formatCents(stats.outstandingCents)} tone={stats.outstandingCents > 0 ? "danger" : undefined} />
            <Stat label="Paid in full" value={stats.paidInFullCount} hint={`${stats.partialCount} partial, ${stats.unpaidCount} unpaid`} />
            <Stat label="Overdue" value={stats.overdueCount} tone={stats.overdueCount > 0 ? "danger" : undefined} />
          </div>

          <form method="get" action="/dues" className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value={selected ? selected.id : "all"} />
            <label className="sr-only" htmlFor="dues-status">
              Status
            </label>
            <Select id="dues-status" name="status" defaultValue={statusFilter} className="w-auto">
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <label className="sr-only" htmlFor="dues-class">
              Pledge class
            </label>
            <Select id="dues-class" name="class" defaultValue={classFilter ?? ""} className="w-auto">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label className="sr-only" htmlFor="dues-q">
              Search
            </label>
            <Input id="dues-q" name="q" placeholder="Search brothers" defaultValue={q ?? ""} className="w-44" />
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {hasFilters ? (
              <ButtonLink href={`/dues?${periodQuery}`} variant="ghost">
                Clear
              </ButtonLink>
            ) : null}
            <span className="ml-auto text-sm text-muted">
              {filtered.length} of {rows.length} brothers
            </span>
          </form>

          {filtered.length === 0 ? (
            <EmptyState title="No brothers match" description={hasFilters ? "Try clearing the filters." : "No current members found."} />
          ) : (
            <>
              <div className="hidden md:block">
                <Card>
                  <Table>
                    <THead>
                      <tr>
                        <Th>Brother</Th>
                        <Th>Class</Th>
                        <Th className="text-right">Charged</Th>
                        <Th className="text-right">Paid</Th>
                        <Th className="text-right">Balance</Th>
                        <Th>Status</Th>
                        <Th>Next due</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {filtered.map((r) => (
                        <Tr key={r.member.id} data-testid={`member-row-${r.member.id}`}>
                          <Td>
                            <MemberLink member={r.member} />
                            {r.hasPlan ? <span className="ml-2 text-xs text-info">plan</span> : null}
                          </Td>
                          <Td className="text-muted">{r.member.pledgeClass?.name ?? ""}</Td>
                          <Td className="text-right">
                            <Money cents={r.chargedCents} />
                          </Td>
                          <Td className="text-right">
                            <Money cents={r.paidCents} />
                          </Td>
                          <Td className="text-right">
                            <Balance cents={r.balanceCents} />
                          </Td>
                          <Td>
                            <DuesStatusPill status={r.status} />
                          </Td>
                          <Td className="whitespace-nowrap text-muted">{r.balanceCents > 0 && r.nextDueDate ? formatDate(r.nextDueDate) : ""}</Td>
                          <Td>
                            <div className="flex justify-end gap-1">
                              <PaymentDialog
                                memberId={r.member.id}
                                memberName={displayName(r.member)}
                                periods={periodOptions}
                                defaultPeriodId={selected?.id ?? active?.id ?? null}
                                today={today}
                                trigger="Pay"
                                triggerVariant="outline"
                                triggerSize="sm"
                              />
                              <ChargeDialog
                                memberId={r.member.id}
                                memberName={displayName(r.member)}
                                periods={periodOptions}
                                defaultPeriodId={selected?.id ?? active?.id ?? null}
                                defaultDueDate={selected?.dueDate ?? null}
                                trigger="Charge"
                                triggerSize="sm"
                              />
                              <ButtonLink href={`/dues/members/${r.member.id}`} size="sm" variant="ghost">
                                Ledger
                              </ButtonLink>
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </div>
              <ul className="space-y-2 md:hidden">
                {filtered.map((r) => (
                  <MobileRow key={r.member.id} row={r} periods={periodOptions} defaultPeriodId={selected?.id ?? active?.id ?? null} defaultDueDate={selected?.dueDate ?? null} today={today} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

function MobileRow({
  row: r,
  periods,
  defaultPeriodId,
  defaultDueDate,
  today,
}: {
  row: BalanceRow;
  periods: { id: number; name: string }[];
  defaultPeriodId: number | null;
  defaultDueDate: string | null;
  today: string;
}) {
  return (
    <li>
      <Card className="px-4 py-3" data-testid={`member-card-${r.member.id}`}>
        <div className="flex items-center justify-between gap-2">
          <MemberLink member={r.member} />
          <DuesStatusPill status={r.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {r.member.pledgeClass?.name ?? ""}
            {r.balanceCents > 0 && r.nextDueDate ? ` · due ${formatDate(r.nextDueDate)}` : ""}
          </span>
          <Balance cents={r.balanceCents} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            {formatCents(r.paidCents)} of {formatCents(r.chargedCents)} paid
          </span>
          <div className="flex gap-1">
            <PaymentDialog
              memberId={r.member.id}
              memberName={displayName(r.member)}
              periods={periods}
              defaultPeriodId={defaultPeriodId}
              today={today}
              trigger="Pay"
              triggerVariant="outline"
              triggerSize="sm"
            />
            <ChargeDialog
              memberId={r.member.id}
              memberName={displayName(r.member)}
              periods={periods}
              defaultPeriodId={defaultPeriodId}
              defaultDueDate={defaultDueDate}
              trigger="Charge"
              triggerSize="sm"
            />
            <ButtonLink href={`/dues/members/${r.member.id}`} size="sm" variant="ghost">
              Ledger
            </ButtonLink>
          </div>
        </div>
      </Card>
    </li>
  );
}
