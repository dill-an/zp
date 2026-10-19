import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { displayName, shortName } from "@/lib/names";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { getLaborContext, getLaborStats, type MemberLite } from "@/lib/queries/labor";
import type { MemberStat, StatsScope } from "@/lib/queries/labor-logic";
import { cn } from "@/lib/utils";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "Stats | Labor" };

const SCOPES: { key: StatsScope; label: string; noun: string }[] = [
  { key: "cleans", label: "Cleans", noun: "the cleans group" },
  { key: "cooks", label: "Cooks", noun: "the cooks group" },
  { key: "all", label: "All", noun: "the whole labor pool" },
];

/** Fairness for the semester. The median, the threshold list and the group load are measured within one labor group at a time (cooks cook, so cleans is the default). */
export default async function LaborStatsPage({ searchParams }: { searchParams: Promise<{ min?: string; group?: string }> }) {
  const user = await requireUser();
  const { min: minRaw, group: groupRaw } = await searchParams;
  const min = Math.min(10, Math.max(1, Number.parseInt(minRaw ?? "2", 10) || 2));
  const scope: StatsScope = groupRaw === "cooks" || groupRaw === "all" ? groupRaw : "cleans";
  const scopeInfo = SCOPES.find((s) => s.key === scope)!;
  const ctx = getLaborContext();
  const stats = getLaborStats({ scope });
  const semester = getSetting(SETTING_KEYS.semesterLabel);
  const poolIds = new Set(stats.pool.map((m) => m.id));
  const inScope = (s: MemberStat) => poolIds.has(s.memberId) && (scope === "all" || s.laborGroup === scope);
  const scopedPool = stats.pool.filter((m) => scope === "all" || m.laborGroup === scope);
  const short = stats.belowThreshold(min).filter(inScope);
  const name = (id: number): MemberLite => stats.members.get(id) ?? { id, firstName: "Unknown", lastName: "", preferredName: "Unknown", username: "", laborGroup: "none", status: "inactive" };
  const link = (over: { min?: number; group?: StatsScope }) => {
    const p = new URLSearchParams();
    const g = over.group ?? scope;
    const m = over.min ?? min;
    if (g !== "cleans") p.set("group", g);
    if (m !== 2) p.set("min", String(m));
    const s = p.toString();
    return `/labor/stats${s ? `?${s}` : ""}`;
  };
  type Section = { group: "cleans" | "cooks" | "none"; label: string; rows: MemberStat[] };
  const allSections: Section[] = [
    { group: "cleans", label: "Cleans group", rows: stats.perMember.filter((s) => poolIds.has(s.memberId) && s.laborGroup === "cleans") },
    { group: "cooks", label: "Cooks group", rows: stats.perMember.filter((s) => poolIds.has(s.memberId) && s.laborGroup === "cooks") },
    { group: "none", label: "Not in the pool", rows: stats.perMember.filter((s) => !poolIds.has(s.memberId)) },
  ];
  const sections = allSections.filter((g) => g.rows.length && (scope === "all" || g.group === scope));
  const groupRows = stats.groups.filter((g) => scope === "all" || g.group === scope);

  return (
    <>
      <PageHeader
        title="Fairness"
        description={`How labor is spread across the house, ${semester}. Counts cover posted weeks; points use each job's weight. Open jobs from before ${formatDate(ctx.trackingStart)} are "not tracked" and stay out of the done rate.`}
      />
      <LaborTabs user={user} active="/labor/stats" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5" role="group" aria-label="Labor group">
          {SCOPES.map((s) => (
            <Link key={s.key} href={link({ group: s.key })} className={cn(buttonClasses("ghost", "sm"), scope === s.key && "bg-primary-soft text-primary-strong")} aria-current={scope === s.key ? "true" : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">Median, threshold list and averages are measured within {scopeInfo.noun}.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label={scope === "all" ? "In the pool" : `${scopeInfo.label} group`} value={scopedPool.length} hint={scope === "all" ? stats.groups.map((g) => `${g.size} ${g.group}`).join(", ") : `${stats.pool.length} in the pool`} />
        <Stat label="Assignments" value={stats.totals.assignments} hint="whole house" />
        <Stat label="Done" value={stats.totals.done} tone="success" />
        <Stat label="Missed" value={stats.totals.missed} tone={stats.totals.missed ? "danger" : undefined} />
        <Stat label="Excused" value={stats.totals.excused} />
        <Stat label="Not tracked" value={stats.totals.notTracked} hint={`before ${formatDate(ctx.trackingStart)}`} />
        <Stat label="Median points" value={stats.medianPoints} hint={`median ${stats.medianJobs} jobs, ${scopeInfo.label.toLowerCase()}`} />
      </div>

      {stats.totals.assignments === 0 ? (
        <EmptyState title="No labor recorded yet" description="Stats appear once a week has been posted." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* min-w-0: a grid item otherwise grows to its table's intrinsic width and the page scrolls sideways on phones. */}
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Group load</CardTitle>
                  <p className="text-sm text-muted">{scope === "all" ? "Cooks vs cleans: size and average load of each group." : `Size and average load of ${scopeInfo.noun}. Switch to All to compare the groups.`}</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <tr>
                      <Th>Group</Th>
                      <Th className="text-right">Brothers</Th>
                      <Th className="text-right">Jobs</Th>
                      <Th className="text-right">Avg jobs</Th>
                      <Th className="text-right">Avg points</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {groupRows.map((g) => (
                      <Tr key={g.group} data-group={g.group}>
                        <Td>
                          <StatusPill status={g.group} />
                        </Td>
                        <Td className="text-right tabular-nums">{g.size}</Td>
                        <Td className="text-right tabular-nums">{g.jobs}</Td>
                        <Td className="text-right tabular-nums">{g.avgJobs}</Td>
                        <Td className="text-right tabular-nums">{g.avgPoints}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Brothers with fewer than {min} job{min === 1 ? "" : "s"}</CardTitle>
                  <p className="text-sm text-muted">The sheet&apos;s &quot;has not cleaned twice&quot; list, for {scopeInfo.noun}. Pick the threshold:</p>
                </div>
                <div className="flex gap-1" role="group" aria-label="Minimum jobs">
                  {[1, 2, 3, 4].map((n) => (
                    <Link key={n} href={link({ min: n })} className={cn(buttonClasses("ghost", "sm"), n === min && "bg-primary-soft text-primary-strong")} aria-current={n === min ? "true" : undefined}>
                      {n}
                    </Link>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {short.length === 0 ? (
                  <p className="text-sm text-muted">
                    Everyone in {scopeInfo.noun} has at least {min} job{min === 1 ? "" : "s"}.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2" data-testid="below-threshold">
                    {short.map((s) => (
                      <li key={s.memberId} className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-sm" data-member={name(s.memberId).username}>
                        <MemberLink member={name(s.memberId)} short />
                        <span className="text-xs text-muted">
                          {s.jobs} job{s.jobs === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Per brother</CardTitle>
                <p className="text-sm text-muted">
                  Rows below the median of {scopeInfo.noun} ({stats.medianPoints} points) are highlighted. Done rate counts tracked jobs that were done or missed.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <tr>
                    <Th>Brother</Th>
                    <Th className="text-right">Assigned</Th>
                    <Th className="text-right">Done</Th>
                    <Th className="text-right">Missed</Th>
                    <Th className="text-right">Excused</Th>
                    <Th className="text-right">Not tracked</Th>
                    <Th className="text-right">Done rate</Th>
                    <Th className="text-right">Points</Th>
                  </tr>
                </THead>
                {sections.map((g) => (
                  <TBody key={g.group} data-section={g.group}>
                    <tr className="bg-surface-2/60">
                      <th colSpan={8} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                        {g.label} ({g.rows.length})
                      </th>
                    </tr>
                    {g.rows.map((s) => (
                      <Tr key={s.memberId} className={cn(s.belowMedian && "bg-warning-soft/40")} data-member={name(s.memberId).username}>
                        <Td>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/labor/brothers/${s.memberId}`} className="font-medium hover:underline">
                              {displayName(name(s.memberId))}
                            </Link>
                            {s.belowMedian ? <span className="text-[11px] text-warning">below median</span> : null}
                          </div>
                        </Td>
                        <Td className="text-right tabular-nums">{s.assigned}</Td>
                        <Td className="text-right tabular-nums">{s.done}</Td>
                        <Td className={cn("text-right tabular-nums", s.missed && "text-danger")}>{s.missed}</Td>
                        <Td className="text-right tabular-nums">{s.excused}</Td>
                        <Td className="text-right tabular-nums text-muted">{s.notTracked}</Td>
                        <Td className="text-right tabular-nums">{s.donePct == null ? <span className="text-muted">n/a</span> : `${s.donePct}%`}</Td>
                        <Td className="text-right font-medium tabular-nums">{s.points}</Td>
                      </Tr>
                    ))}
                  </TBody>
                ))}
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Per job</CardTitle>
                <p className="text-sm text-muted">Who has done each job and how often, whole house.</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <tr>
                    <Th>Job</Th>
                    <Th className="text-right">Times</Th>
                    <Th className="text-right">Done</Th>
                    <Th className="text-right">Missed</Th>
                    <Th>Who</Th>
                  </tr>
                </THead>
                <TBody>
                  {stats.perJobType
                    .filter((j) => j.total > 0)
                    .map((j) => (
                      <Tr key={j.jobTypeId}>
                        <Td className="font-medium whitespace-nowrap">{j.name}</Td>
                        <Td className="text-right tabular-nums">{j.total}</Td>
                        <Td className="text-right tabular-nums">{j.done}</Td>
                        <Td className={cn("text-right tabular-nums", j.missed && "text-danger")}>{j.missed}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {j.byMember.map((b) => (
                              <Link key={b.memberId} href={`/labor/brothers/${b.memberId}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:bg-border">
                                {shortName(name(b.memberId))}
                                {b.count > 1 ? <span className="text-muted"> ×{b.count}</span> : null}
                              </Link>
                            ))}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
