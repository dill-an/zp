import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCents } from "@/lib/money";
import { humanize } from "@/lib/utils";
import { SOURCE_LABELS, SOURCE_TONES, STATUS_LABELS } from "./format";

export function SourceBadge({ source }: { source: string }) {
  return <Badge tone={SOURCE_TONES[source] ?? "neutral"}>{SOURCE_LABELS[source] ?? humanize(source)}</Badge>;
}

export function SanctionStatusPill({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusPill status={status} label={STATUS_LABELS[status]} />
      {overdue ? <StatusPill status="overdue" label="Overdue" /> : null}
    </span>
  );
}

/** Fine amount linking to the ledger (`/dues` for the brother, their ledger page for managers). */
export function FineAmount({ cents, href, muted = "No fine" }: { cents: number | null | undefined; href: string; muted?: string }) {
  if (!cents) return <span className="text-muted">{muted}</span>;
  return (
    <Link href={href} className="font-medium tabular-nums hover:underline" title="See in dues">
      {formatCents(cents)}
    </Link>
  );
}

export function HoursLabel({ hours }: { hours: number | null | undefined }) {
  if (!hours) return <span className="text-muted">-</span>;
  return (
    <span className="tabular-nums">
      {hours} {hours === 1 ? "hr" : "hrs"}
    </span>
  );
}
