import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { allowedActions } from "@/lib/queries/sanctions-logic";
import type { SanctionRow } from "@/lib/queries/sanctions";
import { describeDue, formatInstantDate } from "./format";
import { FineAmount, HoursLabel, SanctionStatusPill, SourceBadge } from "./pills";
import { DeleteButton, StatusButton } from "./status-buttons";

function ManagerActions({ s, compact = false }: { s: SanctionRow; compact?: boolean }) {
  const actions = allowedActions(s.status, { isOwner: false, isManager: true });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.includes("verify") ? <StatusButton id={s.id} action="verify" /> : null}
      {actions.includes("waive") ? <StatusButton id={s.id} action="waive" /> : null}
      {actions.includes("reopen") ? <StatusButton id={s.id} action="reopen" /> : null}
      <Link href={`/sanctions/${s.id}/edit`} className={buttonClasses("outline", "sm")}>
        Edit
      </Link>
      {compact ? null : <DeleteButton id={s.id} />}
    </div>
  );
}

/** Standards board list: a table from md up, stacked cards on phones. */
export function BoardTable({ rows, emptyTitle, emptyDescription }: { rows: SanctionRow[]; emptyTitle: string; emptyDescription?: string }) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  const now = new Date();
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <Tr>
              <Th>Brother</Th>
              <Th>Reason</Th>
              <Th>Job</Th>
              <Th className="text-right">Hours</Th>
              <Th className="text-right">Fine</Th>
              <Th>Source</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((s) => {
              const due = describeDue(s.dueAt, now);
              return (
                <Tr key={s.id} data-sanction-id={s.id}>
                  <Td className="whitespace-nowrap">
                    <MemberLink member={s.member} />
                  </Td>
                  <Td className="min-w-40 max-w-72">
                    <Link href={`/sanctions/${s.id}`} className="font-medium hover:underline">
                      {s.reason}
                    </Link>
                  </Td>
                  <Td className="min-w-32 max-w-64 text-muted">{s.jobDescription || "-"}</Td>
                  <Td className="text-right">
                    <HoursLabel hours={s.hours} />
                  </Td>
                  <Td className="text-right">
                    <FineAmount cents={s.fineChargeCents ?? s.fineCents} href={`/dues/members/${s.memberId}`} muted="-" />
                  </Td>
                  <Td>
                    <SourceBadge source={s.source} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatInstantDate(s.issuedAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {s.dueAt ? (
                      <>
                        <div>{due.when}</div>
                        <div className={s.overdue ? "text-xs text-danger" : "text-xs text-muted"}>{due.hint}</div>
                      </>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </Td>
                  <Td>
                    <SanctionStatusPill status={s.status} overdue={s.overdue} />
                  </Td>
                  <Td>
                    <ManagerActions s={s} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((s) => {
          const due = describeDue(s.dueAt, now);
          return (
            <li key={s.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm" data-sanction-id={s.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <MemberLink member={s.member} />
                  <Link href={`/sanctions/${s.id}`} className="mt-0.5 block font-medium hover:underline">
                    {s.reason}
                  </Link>
                </div>
                <SanctionStatusPill status={s.status} overdue={s.overdue} />
              </div>
              {s.jobDescription ? <p className="mt-2 text-sm text-muted">{s.jobDescription}</p> : null}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Hours</dt>
                <dd>
                  <HoursLabel hours={s.hours} />
                </dd>
                <dt className="text-muted">Fine</dt>
                <dd>
                  <FineAmount cents={s.fineChargeCents ?? s.fineCents} href={`/dues/members/${s.memberId}`} muted="-" />
                </dd>
                <dt className="text-muted">Source</dt>
                <dd>
                  <SourceBadge source={s.source} />
                </dd>
                <dt className="text-muted">Issued</dt>
                <dd>{formatInstantDate(s.issuedAt)}</dd>
                <dt className="text-muted">Due</dt>
                <dd>
                  {due.when}
                  {due.hint ? <span className={s.overdue ? "ml-1 text-xs text-danger" : "ml-1 text-xs text-muted"}>({due.hint})</span> : null}
                </dd>
              </dl>
              <div className="mt-3">
                <ManagerActions s={s} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
