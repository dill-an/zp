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
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { getLaborStats, type MemberLite } from "@/lib/queries/labor";
import type { MemberStat } from "@/lib/queries/labor-logic";
import { cn } from "@/lib/utils";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "Stats | Labor" };

export default async function LaborStatsPage({ searchParams }: { searchParams: Promise<{ min?: string }> }) {
  const user = await requireUser();
  const { min: minRaw } = await searchParams;
  const min = Math.min(10, Math.max(1, Number.parseInt(minRaw ?? "2", 10) || 2));
  const stats = getLaborStats();
  const semester = getSetting(SETTING_KEYS.semesterLabel);
  const poolIds = new Set(stats.pool.map((m) => m.id));
  const short = stats.belowThreshold(min).filter((s) => poolIds.has(s.memberId));
  const name = (id: number): MemberLite => stats.members.get(id) ?? { id, firstName: "Unknown", lastName: "", preferredName: "Unknown", username: "", laborGroup: "none", status: "inactive" };
  const groups: { group: "cleans" | "cooks" | "none"; label: string; rows: MemberStat[] }[] = [
    { group: "cleans", label: "Cleans group", rows: stats.perMember.filter((s) => poolIds.has(s.memberId) && s.laborGroup === "cleans") },
    { group: "cooks", label: "Cooks group", rows: stats.perMember.filter((s) => poolIds.has(s.memberId) && s.laborGroup === "cooks") },
    { group: "none", label: "Not in the pool", rows: stats.perMember.filter((s) => !poolIds.has(s.memberId)) },
  ];

  return (
    <>
      <PageHeader title="Fairness" description={`How labor is spread across the house, ${semester}. Counts cover posted weeks; points use each job's weight.`} />
      <LaborTabs user={user} active="/labor/stats" />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="In the pool" value={stats.pool.length} hint={stats.groups.map((g) => `${g.size} ${g.group}`).join(", ")} />
        <Stat label="Assignments" value={stats.totals.assignments} />
        <Stat label="Done" value={stats.totals.done} tone="success" />
        <Stat label="Missed" value={stats.totals.missed} tone={stats.totals.missed ? "danger" : undefined} />
        <Stat label="Excused" value={stats.totals.excused} />
        <Stat label="Median points" value={stats.medianPoints} hint={`median ${stats.medianJobs} jobs`} />
      </div>

      {stats.totals.assignments === 0 ? (
        <EmptyState title="No labor recorded yet" description="Stats appear once a week has been posted." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* min-w-0: a grid item otherwise grows to its table's intrinsic width and the page scrolls sideways on phones. */}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Cooks vs cleans</CardTitle>
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
                    {stats.groups.map((g) => (
                      <Tr key={g.group}>
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
                  <p className="text-sm text-muted">The sheet&apos;s &quot;has not cleaned twice&quot; list. Pick the threshold:</p>
                </div>
                <div className="flex gap-1" role="group" aria-label="Minimum jobs">
                  {[1, 2, 3, 4].map((n) => (
                    <Link key={n} href={`/labor/stats?min=${n}`} className={cn(buttonClasses("ghost", "sm"), n === min && "bg-primary-soft text-primary-strong")} aria-current={n === min ? "true" : undefined}>
                      {n}
                    </Link>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {short.length === 0 ? (
                  <p className="text-sm text-muted">Everyone in the pool has at least {min} job{min === 1 ? "" : "s"}.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2" data-testid="below-threshold">
                    {short.map((s) => (
                      <li key={s.memberId} className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-sm">
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
                <p className="text-sm text-muted">Rows below the median ({stats.medianPoints} points) are highlighted.</p>
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
                    <Th className="text-right">Points</Th>
                  </tr>
                </THead>
                {groups
                  .filter((g) => g.rows.length)
                  .map((g) => (
                    <TBody key={g.group}>
                      <tr className="bg-surface-2/60">
                        <th colSpan={6} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                          {g.label} ({g.rows.length})
                        </th>
                      </tr>
                      {g.rows.map((s) => (
                        <Tr key={s.memberId} className={cn(s.belowMedian && g.group !== "none" && "bg-warning-soft/40")}>
                          <Td>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/labor/brothers/${s.memberId}`} className="font-medium hover:underline">
                                {name(s.memberId).preferredName} {name(s.memberId).lastName}
                              </Link>
                              {s.belowMedian && g.group !== "none" ? <span className="text-[11px] text-warning">below median</span> : null}
                            </div>
                          </Td>
                          <Td className="text-right tabular-nums">{s.assigned}</Td>
                          <Td className="text-right tabular-nums">{s.done}</Td>
                          <Td className={cn("text-right tabular-nums", s.missed && "text-danger")}>{s.missed}</Td>
                          <Td className="text-right tabular-nums">{s.excused}</Td>
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
                <p className="text-sm text-muted">Who has done each job and how often.</p>
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
                                {name(b.memberId).preferredName}
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
