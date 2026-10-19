import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { OfficerPanel as OfficerPanelData } from "@/lib/queries/dashboard";
import { laborWeekNotice } from "@/lib/queries/dashboard-logic";
import { pluralize } from "@/lib/utils";

function Line({ href, children, tone }: { href: string; children: React.ReactNode; tone?: "danger" | "warning" }) {
  return (
    <li>
      <Link href={href} className={`text-sm hover:underline ${tone === "danger" ? "font-medium text-danger" : tone === "warning" ? "font-medium text-warning" : ""}`}>
        {children}
      </Link>
    </li>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1.5 py-3">
        <Link href={href} className="text-sm font-semibold hover:underline">
          {title}
        </Link>
        <ul className="space-y-1">{children}</ul>
      </CardContent>
    </Card>
  );
}

/** Officer-only cards: one per chair held plus one per module permission. */
export function OfficerPanel({ panel }: { panel: OfficerPanelData }) {
  if (panel.isEmpty) return null;
  return (
    <section className="space-y-3" data-testid="officer-panel" aria-labelledby="officer-panel-heading">
      <h2 id="officer-panel-heading" className="text-lg font-semibold">
        Officer panel
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {panel.chairs.map((c) => (
          <Panel key={c.id} title={c.name} href={`/tasks?chair=${c.id}`}>
            <Line href={`/tasks?chair=${c.id}`}>{pluralize(c.open, "open task")}</Line>
            {c.overdue ? (
              <Line href={`/tasks?chair=${c.id}&status=overdue`} tone="danger">
                {c.overdue} overdue
              </Line>
            ) : (
              <li className="text-sm text-muted">Nothing overdue</li>
            )}
            <Line href={`/tasks/new?chair=${c.id}`}>New task</Line>
          </Panel>
        ))}

        {panel.labor ? (
          <Panel title={`Labor · week of ${formatDate(panel.labor.weekStart)}`} href="/labor">
            {(() => {
              const notice = laborWeekNotice({ exists: panel.labor.hasWeek, isPublished: panel.labor.hasWeek && !panel.labor.isDraft }, panel.labor.weekStart);
              return notice ? (
                <Line href={notice.href} tone="warning">
                  <span data-testid="labor-week-notice">{notice.text}</span>
                </Line>
              ) : null;
            })()}
            {panel.labor.hasWeek ? (
              <>
                <Line href="/labor?manage=1" tone={panel.labor.unfilled ? "warning" : undefined}>
                  {pluralize(panel.labor.unfilled, "unfilled slot")}
                </Line>
                <Line href="/labor/verify" tone={panel.labor.unverified ? "warning" : undefined}>
                  {pluralize(panel.labor.unverified, "done job")} to verify
                </Line>
              </>
            ) : null}
            <Line href="/labor/swaps">{pluralize(panel.labor.swaps, "swap request")} pending</Line>
            <Line href="/labor/excuses">{pluralize(panel.labor.excuses, "excuse request")} pending</Line>
          </Panel>
        ) : null}

        {panel.dues ? (
          <Panel title={`Dues${panel.dues.periodName ? ` · ${panel.dues.periodName}` : ""}`} href="/dues">
            <Line href="/dues">{formatCents(panel.dues.stats.outstandingCents)} outstanding</Line>
            <Line href="/dues?status=overdue" tone={panel.dues.stats.overdueCount ? "danger" : undefined}>
              {pluralize(panel.dues.stats.overdueCount, "brother")} overdue
            </Line>
            <li className="text-sm text-muted">
              {panel.dues.stats.paidInFullCount} paid · {panel.dues.stats.partialCount} partial · {panel.dues.stats.unpaidCount} unpaid
            </li>
          </Panel>
        ) : null}

        {panel.meetings ? (
          <Panel title="Meetings" href="/meetings">
            {panel.meetings.needsAttendance.length ? (
              panel.meetings.needsAttendance.map((m) => (
                <Line key={m.id} href={`/meetings/${m.id}/attendance`} tone="warning">
                  Take attendance: {m.title}, {formatDate(m.scheduledAt)}
                </Line>
              ))
            ) : (
              <li className="text-sm text-muted">Attendance is up to date</li>
            )}
            {panel.meetings.next ? <Line href={`/meetings/${panel.meetings.next.id}`}>Next: {formatDateTime(panel.meetings.next.scheduledAt)}</Line> : null}
            <Line href="/meetings/excuses" tone={panel.meetings.pendingExcuses ? "warning" : undefined}>
              {pluralize(panel.meetings.pendingExcuses, "excuse request")} pending
            </Line>
          </Panel>
        ) : null}

        {panel.maintenance ? (
          <Panel title="Maintenance" href="/maintenance">
            <Line href="/maintenance" tone={panel.maintenance.open ? "warning" : undefined}>
              {pluralize(panel.maintenance.open, "open request")}
            </Line>
          </Panel>
        ) : null}

        {panel.sanctions ? (
          <Panel title="Sanctions" href="/sanctions">
            <Line href="/sanctions?tab=to_verify" tone={panel.sanctions.toVerify ? "warning" : undefined}>
              {panel.sanctions.toVerify} awaiting verification
            </Line>
            <Line href="/sanctions?tab=open">{panel.sanctions.open} open</Line>
            {panel.sanctions.overdue ? (
              <Line href="/sanctions?tab=open" tone="danger">
                {panel.sanctions.overdue} overdue
              </Line>
            ) : null}
            {panel.sanctions.appealed ? <Line href="/sanctions?tab=appealed">{panel.sanctions.appealed} appealed</Line> : null}
          </Panel>
        ) : null}
      </div>
    </section>
  );
}
