import Link from "next/link";
import { MemberLink } from "@/components/member-link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { requireUser } from "@/lib/auth";
import { formatDate, formatShortDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getBrothersWeeklyMatrix } from "@/lib/queries/labor";
import { cn } from "@/lib/utils";
import { JobChip } from "../_components/job-chip";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "Brothers | Labor" };

type Params = { group?: string; q?: string; view?: string };

export default async function BrothersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const group = sp.group === "cooks" || sp.group === "cleans" ? sp.group : undefined;
  const q = sp.q?.trim() ?? "";
  const view = sp.view === "list" ? "list" : "grid";
  const matrix = getBrothersWeeklyMatrix({ group, q, includeUnpublished: can(user, "labor.manage") });
  const link = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged = { group: group ?? "", q, view, ...over };
    if (merged.group) p.set("group", merged.group);
    if (merged.q) p.set("q", merged.q);
    if (merged.view === "list") p.set("view", "list");
    const s = p.toString();
    return `/labor/brothers${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Brothers, week by week" description="What every brother is doing each week. Chips are coloured by status; tap a name for their full history." />
      <LaborTabs user={user} active="/labor/brothers" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5" role="group" aria-label="Labor group">
          {[
            { key: "", label: "All" },
            { key: "cleans", label: "Cleans" },
            { key: "cooks", label: "Cooks" },
          ].map((g) => (
            <Link key={g.key} href={link({ group: g.key })} className={cn(buttonClasses("ghost", "sm"), (group ?? "") === g.key && "bg-primary-soft text-primary-strong")} aria-current={(group ?? "") === g.key ? "true" : undefined}>
              {g.label}
            </Link>
          ))}
        </div>
        <form action="/labor/brothers" className="flex items-center gap-2">
          {group ? <input type="hidden" name="group" value={group} /> : null}
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
          <Input name="q" placeholder="Search brothers" defaultValue={q} aria-label="Search brothers" className="h-8 w-40 sm:w-56" />
          <button type="submit" className={buttonClasses("outline", "sm")}>
            Search
          </button>
          {q ? (
            <Link href={link({ q: "" })} className="text-xs text-muted underline">
              Clear
            </Link>
          ) : null}
        </form>
        <div className="ml-auto flex gap-1 rounded-md border border-border p-0.5" role="group" aria-label="View">
          <Link href={link({ view: "grid" })} className={cn(buttonClasses("ghost", "sm"), view === "grid" && "bg-primary-soft text-primary-strong")}>
            Grid
          </Link>
          <Link href={link({ view: "list" })} className={cn(buttonClasses("ghost", "sm"), view === "list" && "bg-primary-soft text-primary-strong")}>
            List
          </Link>
        </div>
      </div>

      {matrix.rows.length === 0 ? (
        <EmptyState title="No brothers match" description={q ? `Nobody in the labor pool matches "${q}".` : "The labor pool is empty."} />
      ) : matrix.weeks.length === 0 ? (
        <EmptyState title="No labor weeks yet" description="Once a week is posted, each brother's jobs show up here." />
      ) : view === "list" ? (
        <ListView matrix={matrix} />
      ) : (
        <GridView matrix={matrix} viewerId={user.id} />
      )}
      <p className="mt-3 text-xs text-muted">
        Totals count assigned and done jobs (missed and excused jobs are left out). Points come from each job type&apos;s weight.
      </p>
    </>
  );
}

type Matrix = ReturnType<typeof getBrothersWeeklyMatrix>;

function GridView({ matrix, viewerId }: { matrix: Matrix; viewerId: number }) {
  return (
    <div className="table-wrap rounded-lg border border-border bg-surface" data-testid="brothers-grid">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-2 px-2 py-2 font-medium sm:px-3">Brother</th>
            {matrix.weeks.map((w) => {
              const current = w.weekStart === matrix.currentWeekStart;
              return (
                <th key={w.id} className={cn("min-w-28 px-2 py-2 font-medium", current && "bg-primary-soft text-primary-strong")} aria-current={current ? "date" : undefined}>
                  <Link href={`/labor/week/${w.weekStart}`} className="hover:underline">
                    {formatShortDate(w.weekStart)}
                  </Link>
                  {current ? <span className="block text-[10px] normal-case tracking-normal">this week</span> : null}
                  {!w.isPublished ? <span className="block text-[10px] normal-case tracking-normal">draft</span> : null}
                </th>
              );
            })}
            <th className="px-2 py-2 text-right font-medium">Jobs</th>
            <th className="px-2 py-2 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {matrix.rows.map((row) => {
            const me = row.member.id === viewerId;
            return (
              <tr key={row.member.id} className={cn("align-top hover:bg-surface-2/60", me && "bg-primary-soft/30")} data-member={row.member.username}>
                <td className={cn("sticky left-0 z-10 max-w-36 bg-surface px-2 py-1.5 sm:px-3", me && "bg-primary-soft/30")}>
                  <div className="flex flex-col">
                    <Link href={`/labor/brothers/${row.member.id}`} className="truncate font-medium hover:underline">
                      {row.member.preferredName || row.member.firstName}
                    </Link>
                    <span className="truncate text-[11px] text-muted">
                      {(row.member.preferredName || row.member.firstName).includes(" ") ? "" : `${row.member.lastName} · `}
                      {row.member.laborGroup}
                    </span>
                  </div>
                </td>
                {matrix.weeks.map((w) => {
                  const jobs = row.byWeek[w.weekStart] ?? [];
                  const current = w.weekStart === matrix.currentWeekStart;
                  return (
                    <td key={w.id} className={cn("px-1.5 py-1.5", current && "bg-primary-soft/20")}>
                      {jobs.length ? (
                        <div className="flex flex-col items-start gap-1">
                          {jobs.map((a) => (
                            <JobChip key={a.id} name={a.jobType.name} state={a.state} weekStart={a.weekStart} dueDate={a.dueDate} windowLabel={a.jobType.windowLabel} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted/60">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums">{row.totals.jobs}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{row.totals.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListView({ matrix }: { matrix: Matrix }) {
  const weeks = [...matrix.weeks].reverse();
  return (
    <ul className="space-y-3" data-testid="brothers-list">
      {matrix.rows.map((row) => (
        <li key={row.member.id} className="rounded-lg border border-border bg-surface" data-member={row.member.username}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <MemberLink member={row.member} withAvatar />
              <StatusPill status={row.member.laborGroup} />
            </div>
            <div className="text-xs text-muted">
              {row.totals.jobs} jobs · {row.totals.points} pts
              {row.totals.missed ? ` · ${row.totals.missed} missed` : ""}
              {" · "}
              <Link href={`/labor/brothers/${row.member.id}`} className="underline">
                History
              </Link>
            </div>
          </div>
          <dl className="divide-y divide-border text-sm">
            {weeks.map((w) => {
              const jobs = row.byWeek[w.weekStart] ?? [];
              const current = w.weekStart === matrix.currentWeekStart;
              return (
                <div key={w.id} className={cn("flex items-start gap-3 px-3 py-1.5", current && "bg-primary-soft/20")}>
                  <dt className="w-24 shrink-0 text-xs text-muted">
                    {formatDate(w.weekStart)}
                    {current ? <span className="block text-[10px]">this week</span> : null}
                  </dt>
                  <dd className="flex flex-wrap gap-1">
                    {jobs.length ? (
                      jobs.map((a) => <JobChip key={a.id} name={a.jobType.name} state={a.state} weekStart={a.weekStart} dueDate={a.dueDate} windowLabel={a.jobType.windowLabel} />)
                    ) : (
                      <span className="text-xs text-muted/70">none</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </li>
      ))}
    </ul>
  );
}
