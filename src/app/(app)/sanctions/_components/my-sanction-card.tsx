import Link from "next/link";
import { allowedActions } from "@/lib/queries/sanctions-logic";
import type { SanctionRow } from "@/lib/queries/sanctions";
import { describeDue, formatInstantDate } from "./format";
import { FineAmount, HoursLabel, SanctionStatusPill, SourceBadge } from "./pills";
import { AppealDialog, StatusButton } from "./status-buttons";

/** One of the brother's own sanctions, with the actions they can take on it. */
export function MySanctionCard({ s, now = new Date() }: { s: SanctionRow; now?: Date }) {
  const actions = allowedActions(s.status, { isOwner: true, isManager: false });
  const due = describeDue(s.dueAt, now);
  return (
    <li className="rounded-lg border border-border bg-surface p-4 shadow-sm" data-sanction-id={s.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/sanctions/${s.id}`} className="block font-semibold leading-snug hover:underline">
            {s.reason}
          </Link>
          {s.jobDescription ? <p className="mt-1 text-sm">{s.jobDescription}</p> : null}
        </div>
        <SanctionStatusPill status={s.status} overdue={s.overdue} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Hours</dt>
          <dd>
            <HoursLabel hours={s.hours} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Fine</dt>
          <dd>
            <FineAmount cents={s.fineChargeCents ?? s.fineCents} href="/dues" />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Issued</dt>
          <dd>
            {formatInstantDate(s.issuedAt)}
            {s.issuedBy ? <span className="text-muted"> by {s.issuedBy.preferredName}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Due</dt>
          <dd>
            {due.when}
            {due.hint ? <span className={s.overdue ? "block text-xs font-medium text-danger" : "block text-xs text-muted"}>{due.hint}</span> : null}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SourceBadge source={s.source} />
        {s.status === "completed" ? <span className="text-xs text-muted">Waiting for a standards officer to verify.</span> : null}
        {s.status === "verified" && s.verifiedBy ? (
          <span className="text-xs text-muted">
            Verified by {s.verifiedBy.preferredName} on {formatInstantDate(s.verifiedAt)}
          </span>
        ) : null}
      </div>

      {actions.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {actions.includes("start") ? <StatusButton id={s.id} action="start" /> : null}
          {actions.includes("complete") ? <StatusButton id={s.id} action="complete" /> : null}
          {actions.includes("appeal") ? <AppealDialog id={s.id} /> : null}
        </div>
      ) : null}
    </li>
  );
}
