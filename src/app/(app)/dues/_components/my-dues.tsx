import { ButtonLink, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { dueDescription, formatDate, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { getActivePeriod, getMemberBalance, getMemberDueItems, getMemberLedger, getMemberPeriodRows } from "@/lib/queries/dues";
import { dueLineParts, statusTone } from "@/lib/queries/dues-logic";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { methodLabel } from "./constants";
import { Balance, DuesStatusPill, KindBadge, Money } from "./display";
import { PlanCard } from "./plan-card";

const TONE_TEXT: Record<string, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info" };

/** "My dues": the two-second answer (owe? how much? by when?) followed by the member's own charges and payments. */
export function MyDues({ memberId }: { memberId: number }) {
  const balance = getMemberBalance(memberId);
  const periodRows = getMemberPeriodRows(memberId);
  const ledger = getMemberLedger(memberId);
  const activePeriod = getActivePeriod();
  const venmo = getSetting(SETTING_KEYS.venmoHandle).trim();
  const semester = activePeriod?.name ?? getSetting(SETTING_KEYS.semesterLabel);
  const charges = ledger?.charges ?? [];
  const payments = [...(ledger?.payments ?? [])].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  const recentCharges = [...charges].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const openPlans = (ledger?.plans ?? []).filter((p) => p.status === "proposed" || p.status === "approved");
  const tone = statusTone(balance.status);

  const headline =
    balance.balanceCents > 0 ? "You owe" : balance.balanceCents < 0 ? "Credit on your account" : balance.status === "none" ? "Nothing billed yet" : "All paid up";
  // What is owed, item by item ("$25.00 fine due Oct 23 · $450.00 Fall 2026 dues due Nov 1"), so a fine that is due
  // before the dues is named as a fine instead of its date reading as the dues due date.
  const dueItems = balance.balanceCents > 0 ? getMemberDueItems(memberId) : [];
  const dueParts = dueLineParts(dueItems, todayISO());
  const firstDue = dueItems[0]?.dueDate ?? null;
  const dueLine =
    balance.balanceCents > 0
      ? dueParts.length > 0
        ? dueParts.map((part, i) => (i === 0 && firstDue ? `${part} (${dueDescription(firstDue)})` : part)).join(" · ")
        : "No due date set"
      : balance.status === "none"
        ? "The treasurer has not billed you for anything."
        : "Nothing outstanding.";

  return (
    <div className="space-y-4">
      <Card data-testid="my-balance-card">
        <CardContent className="py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{headline}</p>
              <p className={cn("mt-1 text-4xl font-semibold tabular-nums", tone ? TONE_TEXT[tone] : "")} data-testid="my-balance">
                {formatCents(Math.abs(balance.balanceCents))}
              </p>
              <p className={cn("mt-1 text-sm", balance.status === "overdue" ? "text-danger font-medium" : "text-muted")} data-testid="my-due-line">
                {dueLine}
              </p>
            </div>
            <DuesStatusPill status={balance.status} className="text-sm" />
          </div>
          {openPlans.length > 0 && openPlans[0].status === "approved" && openPlans[0].next ? (
            <p className="mt-3 text-sm">
              Payment plan: next installment <span className="font-medium tabular-nums">{formatCents(openPlans[0].next.remainingCents)}</span> by{" "}
              <span className={openPlans[0].next.overdue ? "font-medium text-danger" : "font-medium"}>{formatDate(openPlans[0].next.dueDate, { year: true })}</span>.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>By period</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {periodRows.length === 0 ? (
              <EmptyState className="m-4" title="No charges yet" description="Once the treasurer bills the semester, it shows up here." />
            ) : (
              <ul className="divide-y divide-border">
                {periodRows.map((row) => (
                  <li key={row.period?.id ?? "none"} className="px-4 py-3" data-testid={`period-row-${row.period?.id ?? "none"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{row.period?.name ?? "Other charges"}</p>
                      <DuesStatusPill status={row.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span>
                        Charged <Money cents={row.chargedCents} className="text-text" />
                      </span>
                      <span>
                        Paid <Money cents={row.paidCents} className="text-text" />
                      </span>
                      <span>
                        Balance <Balance cents={row.balanceCents} />
                      </span>
                      {row.balanceCents > 0 && row.nextDueDate ? <span>Due {formatDate(row.nextDueDate, { year: true })}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How to pay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Venmo: <span className="font-medium">{venmo ? (venmo.startsWith("@") ? venmo : `@${venmo}`) : "Ask the treasurer"}</span>
            </p>
            <p className="text-muted">Put your name and the semester ({semester}) in the memo so the treasurer can match it.</p>
            <p className="text-muted">Paid another way? Tell the treasurer and it will show up under Payments once recorded.</p>
            <ButtonLink href={`/dues/members/${memberId}`} variant="outline" size="sm" className="mt-1">
              Full ledger
            </ButtonLink>
          </CardContent>
        </Card>
      </div>

      {openPlans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} manage={false} />
      ))}

      {/* min-w-0: a grid item otherwise sizes to its table's min-content width and pushes the page wider than a phone. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>My charges</CardTitle>
            <CardDescription>Everything billed to you, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {recentCharges.length === 0 ? (
              <EmptyState className="m-4" title="No charges" description="Nothing has been billed to you." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Kind</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Due</Th>
                  </tr>
                </THead>
                <TBody>
                  {recentCharges.map((c) => (
                    <Tr key={c.id}>
                      <Td className="whitespace-nowrap">{formatDate(c.createdAt)}</Td>
                      <Td>
                        <KindBadge kind={c.kind} />
                      </Td>
                      <Td>{c.description}</Td>
                      <Td className="text-right">
                        <Money cents={c.amountCents} />
                      </Td>
                      <Td className="whitespace-nowrap">{c.dueDate ? formatDate(c.dueDate) : ""}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>My payments</CardTitle>
            <CardDescription>Payments the treasurer has recorded.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {payments.length === 0 ? (
              <EmptyState className="m-4" title="No payments yet" description="Payments appear here once the treasurer records them." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Reference</Th>
                  </tr>
                </THead>
                <TBody>
                  {payments.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap">{formatDate(p.paidAt)}</Td>
                      <Td>{methodLabel(p.method)}</Td>
                      <Td className="text-right">
                        <Money cents={p.amountCents} />
                      </Td>
                      <Td className="text-muted">{p.reference ?? ""}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
