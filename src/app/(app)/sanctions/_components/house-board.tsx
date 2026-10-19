import { MemberLink } from "@/components/member-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import type { HouseBoardEntry } from "@/lib/queries/sanctions";
import type { HouseBoardCounts } from "@/lib/queries/sanctions-logic";
import { describeDue, formatInstantDate } from "./format";
import { SanctionStatusPill } from "./pills";

/**
 * Read-only board for the whole house: which punishment jobs are out there, who still needs to do one and by when,
 * and what has been done this semester. Shows brother, job, date and status only; notes, appeals, fines and sources
 * stay between the brother and standards, and rows do not link to the sanction (other brothers get a 404 there).
 */
export function HouseBoard({ open, done, counts }: { open: HouseBoardEntry[]; done: HouseBoardEntry[]; counts: HouseBoardCounts }) {
  const now = new Date();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3" data-testid="house-board-counts">
        <Stat label="Open jobs" value={counts.open} hint={`${counts.brothersOpen} ${counts.brothersOpen === 1 ? "brother" : "brothers"}`} />
        <Stat label="Overdue" value={counts.overdue} tone={counts.overdue > 0 ? "danger" : undefined} hint="past due, not done" />
        <Stat label="Done this semester" value={counts.doneThisSemester} tone="success" hint="completed or verified" />
      </div>

      <section aria-labelledby="house-open-heading" data-testid="house-board-open">
        <h2 id="house-open-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Who still needs to do one ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Nobody owes a punishment job right now." className="py-6" />
        ) : (
          <BoardList rows={open} now={now} mode="open" />
        )}
      </section>

      <section aria-labelledby="house-done-heading" data-testid="house-board-done">
        <h2 id="house-done-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Done this semester ({done.length})
        </h2>
        {done.length === 0 ? (
          <EmptyState title="Nothing done yet this semester" description="Jobs show up here once a brother marks one completed." className="py-6" />
        ) : (
          <BoardList rows={done} now={now} mode="done" />
        )}
      </section>
    </div>
  );
}

function BoardList({ rows, now, mode }: { rows: HouseBoardEntry[]; now: Date; mode: "open" | "done" }) {
  const dateLabel = mode === "open" ? "Due" : "Done";
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <Tr>
              <Th>Brother</Th>
              <Th>Job</Th>
              <Th>{dateLabel}</Th>
              <Th>Status</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const due = describeDue(r.dueAt, now);
              return (
                <Tr key={r.id} data-sanction-id={r.id}>
                  <Td className="whitespace-nowrap">
                    <MemberLink member={r.member} />
                  </Td>
                  <Td className="min-w-48">
                    <JobCell row={r} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {mode === "done" ? (
                      <span className="text-muted">{formatInstantDate(r.doneAt)}</span>
                    ) : r.dueAt ? (
                      <>
                        <div>{due.when}</div>
                        <div className={r.overdue ? "text-xs text-danger" : "text-xs text-muted"}>{due.hint}</div>
                      </>
                    ) : (
                      <span className="text-muted">No due date</span>
                    )}
                  </Td>
                  <Td>
                    <SanctionStatusPill status={r.status} overdue={r.overdue} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((r) => {
          const due = describeDue(r.dueAt, now);
          return (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm" data-sanction-id={r.id}>
              <div className="flex items-start justify-between gap-2">
                <MemberLink member={r.member} />
                <SanctionStatusPill status={r.status} overdue={r.overdue} />
              </div>
              <p className="mt-1 text-sm">
                <JobCell row={r} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {mode === "done" ? (
                  `Done ${formatInstantDate(r.doneAt)}`
                ) : r.dueAt ? (
                  <>
                    Due {due.when}
                    {due.hint ? <span className={r.overdue ? "ml-1 font-medium text-danger" : "ml-1"}>({due.hint})</span> : null}
                  </>
                ) : (
                  "No due date"
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function JobCell({ row }: { row: HouseBoardEntry }) {
  if (row.hasJob) return <span>{row.job}</span>;
  return (
    <span>
      {row.job} <span className="text-xs text-muted">(no job, hours or fine only)</span>
    </span>
  );
}
