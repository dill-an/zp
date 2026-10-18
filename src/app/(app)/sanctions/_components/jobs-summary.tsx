import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { NO_JOB_LABEL, type JobSummary } from "@/lib/queries/sanctions-logic";
import { describeDue } from "./format";
import { STATUS_LABELS } from "./format";

/** "What punishment jobs there are, how many have done them, who still needs to and by when." */
export function JobsSummary({ jobs }: { jobs: JobSummary[] }) {
  if (jobs.length === 0) return <EmptyState title="No punishment jobs yet" description="Jobs appear here once sanctions with a job description are issued." />;
  const now = new Date();
  return (
    <Table>
      <THead>
        <Tr>
          <Th>Job</Th>
          <Th className="text-right">Done</Th>
          <Th className="text-right">Still owed</Th>
          <Th className="text-right">Waived</Th>
          <Th>Who still needs to do it</Th>
        </Tr>
      </THead>
      <TBody>
        {jobs.map((j) => (
          <Tr key={j.job}>
            <Td className="min-w-48 font-medium">
              {j.job === NO_JOB_LABEL ? (
                // Synthetic group: these sanctions have no job text, so the q= filter could not find them.
                <span>{j.job}</span>
              ) : (
                <Link href={`/sanctions?tab=all&q=${encodeURIComponent(j.job)}`} className="hover:underline">
                  {j.job}
                </Link>
              )}
              <span className="block text-xs text-muted">{j.total} issued</span>
            </Td>
            <Td className="text-right tabular-nums">{j.done}</Td>
            <Td className={j.outstanding ? "text-right font-medium tabular-nums text-warning" : "text-right tabular-nums text-muted"}>{j.outstanding}</Td>
            <Td className="text-right tabular-nums text-muted">{j.waived}</Td>
            <Td className="min-w-56">
              {j.pending.length === 0 ? (
                <span className="text-muted">Nobody</span>
              ) : (
                <ul className="space-y-0.5 text-sm">
                  {j.pending.map((p) => {
                    const due = describeDue(p.dueAt, now);
                    return (
                      <li key={p.sanctionId}>
                        <Link href={`/sanctions/${p.sanctionId}`} className="font-medium hover:underline">
                          {p.memberName ?? `Member #${p.memberId}`}
                        </Link>
                        <span className="text-muted">
                          {" "}
                          ({STATUS_LABELS[p.status] ?? p.status}
                          {p.dueAt ? `, ${due.hint}` : ""})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
