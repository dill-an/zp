import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { humanize } from "@/lib/utils";
import { getSanction, type MemberRef } from "@/lib/queries/sanctions";
import { allowedActions } from "@/lib/queries/sanctions-logic";
import { MemberLink } from "@/components/member-link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { describeDue } from "../_components/format";
import { FineAmount, HoursLabel, SanctionStatusPill, SourceBadge } from "../_components/pills";
import { AppealDialog, DeleteButton, StatusButton } from "../_components/status-buttons";

export const metadata = { title: "Sanction" };

const HISTORY_LABELS: Record<string, string> = {
  "sanction.issue": "Issued",
  "sanction.start": "Started",
  "sanction.complete": "Marked completed",
  "sanction.appeal": "Appealed",
  "sanction.verify": "Verified",
  "sanction.waive": "Waived",
  "sanction.reopen": "Reopened",
  "sanction.edit": "Edited",
};

type TimelineEntry = { key: string; label: string; at: string; by: MemberRef | null; detail?: string };

export default async function SanctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sanctionId = /^\d+$/.test(id) ? Number(id) : NaN;
  const s = Number.isInteger(sanctionId) ? getSanction(sanctionId) : null;
  if (!s) notFound();
  const isManager = can(user, "sanctions.manage");
  const isOwner = s.memberId === user.id;
  if (!isManager && !isOwner) notFound();

  const actions = allowedActions(s.status, { isOwner, isManager });
  const now = new Date();
  const due = describeDue(s.dueAt, now);
  // The ledger page admits the brother himself as well as dues managers.
  const ledgerHref = `/dues/members/${s.memberId}`;

  const timeline: TimelineEntry[] = [{ key: "issued", label: "Issued", at: s.issuedAt, by: s.issuedBy }];
  for (const h of s.history) {
    if (h.action === "sanction.issue") continue;
    const label = HISTORY_LABELS[h.action] ?? humanize(h.action.replace(/^sanction\./, "").replace(/\./g, " "));
    const detail = h.action === "sanction.appeal" || h.action === "sanction.edit" ? h.summary : undefined;
    timeline.push({ key: `h${h.id}`, label, at: h.createdAt, by: h.actor, detail });
  }
  if (s.completedAt && !s.history.some((h) => h.action === "sanction.complete" || h.action === "sanction.verify")) {
    timeline.push({ key: "completed", label: "Completed", at: s.completedAt, by: null });
  }
  if (s.verifiedAt && !s.history.some((h) => h.action === "sanction.verify")) {
    timeline.push({ key: "verified", label: "Verified", at: s.verifiedAt, by: s.verifiedBy });
  }
  timeline.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const fineTotal = s.charges.reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={`Sanction #${s.id}`}
        title={s.reason}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <MemberLink member={s.member} />
            <SourceBadge source={s.source} />
            <SanctionStatusPill status={s.status} overdue={s.overdue} />
          </span>
        }
        actions={
          <>
            {actions.includes("start") ? <StatusButton id={s.id} action="start" size="md" /> : null}
            {actions.includes("complete") ? <StatusButton id={s.id} action="complete" size="md" /> : null}
            {actions.includes("appeal") ? <AppealDialog id={s.id} size="md" /> : null}
            {actions.includes("verify") ? <StatusButton id={s.id} action="verify" size="md" /> : null}
            {actions.includes("waive") ? <StatusButton id={s.id} action="waive" size="md" /> : null}
            {actions.includes("reopen") ? <StatusButton id={s.id} action="reopen" size="md" /> : null}
            {actions.includes("edit") ? (
              <Link href={`/sanctions/${s.id}/edit`} className={buttonClasses("outline", "md")}>
                Edit
              </Link>
            ) : null}
            {actions.includes("delete") ? <DeleteButton id={s.id} size="md" /> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Brother</dt>
                  <dd>
                    <MemberLink member={s.member} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
                  <dd>
                    <SanctionStatusPill status={s.status} overdue={s.overdue} />
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">Punishment job</dt>
                  <dd className={s.jobDescription ? "" : "text-muted"}>{s.jobDescription || "No job, fine or hours only"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Work hours</dt>
                  <dd>
                    <HoursLabel hours={s.hours} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Fine</dt>
                  <dd>
                    <FineAmount cents={s.fineChargeCents ?? s.fineCents} href={ledgerHref} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Issued</dt>
                  <dd>
                    {formatDateTime(s.issuedAt)}
                    {s.issuedBy ? <span className="text-muted"> by {displayName(s.issuedBy)}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Due</dt>
                  <dd>
                    {due.when}
                    {due.hint ? <span className={s.overdue ? "block text-xs font-medium text-danger" : "block text-xs text-muted"}>{due.hint}</span> : null}
                  </dd>
                </div>
                {s.sourceRef ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Source reference</dt>
                    <dd className="text-muted">{s.sourceRef}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {s.notes ? <p className="whitespace-pre-wrap text-sm">{s.notes}</p> : <p className="text-sm text-muted">No notes.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {timeline.map((t) => (
                  <li key={t.key} className="relative border-l-2 border-border pl-3">
                    <p className="font-medium">
                      {t.label}
                      {t.by ? <span className="font-normal text-muted"> by {displayName(t.by)}</span> : null}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(t.at)}</p>
                    {t.detail ? <p className="mt-0.5 text-xs text-muted">{t.detail}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.charges.length === 0 ? (
                s.fineCents ? (
                  <p>
                    {formatCents(s.fineCents)} <span className="text-muted">(no ledger charge linked yet)</span>
                  </p>
                ) : (
                  <p className="text-muted">No fine on this sanction.</p>
                )
              ) : (
                <>
                  <ul className="divide-y divide-border">
                    {s.charges.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <Badge tone={c.kind === "credit" ? "success" : "warning"}>{humanize(c.kind)}</Badge>
                          <p className="mt-1 truncate">{c.description}</p>
                          {c.dueDate ? <p className="text-xs text-muted">Due {formatDate(c.dueDate)}</p> : null}
                        </div>
                        <span className={c.amountCents < 0 ? "tabular-nums text-success" : "tabular-nums"}>{formatCents(c.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="flex items-center justify-between border-t border-border pt-2 font-medium">
                    <span>Net owed from this sanction</span>
                    <span className="tabular-nums">{formatCents(fineTotal)}</span>
                  </p>
                </>
              )}
              <Link href={ledgerHref} className="inline-block text-xs text-primary hover:underline">
                {isManager ? `See ${s.member.preferredName}'s dues ledger` : "See my dues"}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
