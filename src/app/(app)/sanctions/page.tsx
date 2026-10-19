import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, type CurrentUser } from "@/lib/permissions";
import { SANCTION_SOURCES } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { getHouseBoard, getSanctionStats, getSanctionsForMember, listSanctions } from "@/lib/queries/sanctions";
import { filterSanctions, isSanctionTab, SANCTION_TABS, splitForMember, summarizeJobs, TAB_LABELS, type SanctionTab } from "@/lib/queries/sanctions-logic";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { BoardFilters } from "./_components/board-filters";
import { BoardTable } from "./_components/board-table";
import { HouseBoard } from "./_components/house-board";
import { JobsSummary } from "./_components/jobs-summary";
import { MySanctionCard } from "./_components/my-sanction-card";

export const metadata = { title: "Sanctions" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SanctionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const manager = can(user, "sanctions.manage");
  if (manager && first(sp.mine) !== "1") return <Board sp={sp} />;
  // The house board is a setting standards can turn off; when off, ?board=1 just shows the brother's own list.
  const boardPublic = getSetting(SETTING_KEYS.sanctionsBoardPublic) === "1";
  const view = boardPublic && first(sp.board) === "1" ? "board" : "mine";
  return <BrotherView user={user} manager={manager} boardPublic={boardPublic} view={view} />;
}

/* ------------------------------------------------------------------ */
/* Brother view: "My sanctions" and, when allowed, the "House board"   */
/* ------------------------------------------------------------------ */

async function BrotherView({ user, manager, boardPublic, view }: { user: CurrentUser; manager: boolean; boardPublic: boolean; view: "mine" | "board" }) {
  // A manager reaches this view through ?mine=1, so the tabs keep that flag.
  const mineHref = manager ? "/sanctions?mine=1" : "/sanctions";
  const boardHref = manager ? "/sanctions?mine=1&board=1" : "/sanctions?board=1";
  const tabs = boardPublic
    ? [
        { href: mineHref, label: "My sanctions" },
        { href: boardHref, label: "House board" },
      ]
    : [];
  return (
    <>
      <PageHeader
        title={view === "board" ? "House board" : "My sanctions"}
        description={
          view === "board"
            ? "Punishment jobs across the house: who still needs to do one, by when, and what has been done this semester."
            : "Punishment jobs, work hours and fines assigned to you. Start a job, mark it done, or appeal it."
        }
        actions={
          <>
            {manager ? (
              <Link href="/sanctions" className={buttonClasses("outline", "sm")}>
                Standards board
              </Link>
            ) : null}
            <Link href="/sanctions/policy" className={buttonClasses("ghost", "sm")}>
              Standards policy
            </Link>
          </>
        }
      />
      {tabs.length > 0 ? <LinkTabs tabs={tabs} active={view === "board" ? boardHref : mineHref} /> : null}
      {view === "board" ? <HouseBoardView /> : <MySanctions user={user} />}
    </>
  );
}

function HouseBoardView() {
  const board = getHouseBoard(new Date());
  return <HouseBoard open={board.open} done={board.done} counts={board.counts} />;
}

function MySanctions({ user }: { user: CurrentUser }) {
  const now = new Date();
  const all = getSanctionsForMember(user.id, now);
  const { active, awaiting, history } = splitForMember(all);
  return (
    <>
      {all.length === 0 ? (
        <EmptyState title="No sanctions" description="You have nothing outstanding. Keep it that way." />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="todo-heading">
            <h2 id="todo-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              To do ({active.length})
            </h2>
            {active.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="Every sanction you have is done or waived." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {active.map((s) => (
                  <MySanctionCard key={s.id} s={s} now={now} />
                ))}
              </ul>
            )}
          </section>

          {awaiting.length ? (
            <section aria-labelledby="awaiting-heading">
              <h2 id="awaiting-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Awaiting verification ({awaiting.length})
              </h2>
              <ul className="space-y-3">
                {awaiting.map((s) => (
                  <MySanctionCard key={s.id} s={s} now={now} />
                ))}
              </ul>
            </section>
          ) : null}

          {history.length ? (
            <section aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                History ({history.length})
              </h2>
              <ul className="space-y-3">
                {history.map((s) => (
                  <MySanctionCard key={s.id} s={s} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Standards board (sanctions.manage)                                  */
/* ------------------------------------------------------------------ */

const JOBS_TAB = "jobs";

function boardHref(tab: string, q: { member: string; source: string; q: string }): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (q.member) params.set("member", q.member);
  if (q.source) params.set("source", q.source);
  if (q.q) params.set("q", q.q);
  return `/sanctions?${params.toString()}`;
}

async function Board({ sp }: { sp: SearchParams }) {
  const now = new Date();
  const tabParam = first(sp.tab);
  const tab: SanctionTab | typeof JOBS_TAB = isSanctionTab(tabParam) ? tabParam : tabParam === JOBS_TAB ? JOBS_TAB : "open";
  const memberParam = first(sp.member);
  const memberId = /^\d+$/.test(memberParam) ? Number(memberParam) : null;
  const sourceParam = first(sp.source);
  const source = (SANCTION_SOURCES as readonly string[]).includes(sourceParam) ? sourceParam : "";
  const q = first(sp.q).slice(0, 100);
  const query = { tab, member: memberId ? String(memberId) : "", source, q };
  const issued = Number(first(sp.issued)) || 0;

  const filtered = listSanctions({ memberId, source: source || null, q: q || null }, now);
  const counts = Object.fromEntries(SANCTION_TABS.map((t) => [t, filterSanctions(filtered, t).length])) as Record<SanctionTab, number>;
  const rows = tab === JOBS_TAB ? [] : filterSanctions(filtered, tab);
  const jobs = tab === JOBS_TAB ? summarizeJobs(filtered) : [];
  const stats = getSanctionStats(now);
  const groups = groupByPledgeClass(listMembers({ activeOnly: true })).map((g) => ({
    label: g.label,
    members: g.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName })),
  }));

  const tabs = [
    ...SANCTION_TABS.map((t) => ({ href: boardHref(t, query), label: TAB_LABELS[t], count: counts[t] })),
    { href: boardHref(JOBS_TAB, query), label: "Jobs" },
  ];

  const filterLabel = [memberId ? "one brother" : "", source ? `source ${source.replace(/_/g, " ")}` : "", q ? `"${q}"` : ""].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title="Standards board"
        description="Every punishment job, fine and work-hours sanction: who owes what, by when, and whether it has been done."
        actions={
          <>
            <Link href="/sanctions?mine=1" className={buttonClasses("ghost", "sm")}>
              My sanctions
            </Link>
            <Link href="/sanctions/policy" className={buttonClasses("outline", "sm")}>
              Policy
            </Link>
            <Link href="/sanctions/new" className={buttonClasses("primary", "sm")}>
              Issue sanction
            </Link>
          </>
        }
      />

      {issued > 0 ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Issued {issued} sanctions.
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={stats.open} hint="open or in progress" />
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? "danger" : undefined} hint="past due, not done" />
        <Stat label="Hours owed" value={stats.outstandingHours} hint="on open sanctions" />
        <Stat label="Fines" value={formatCents(stats.outstandingFines)} hint="on non-waived sanctions" />
      </div>

      <LinkTabs tabs={tabs} active={boardHref(tab, query)} />
      <BoardFilters query={query} groups={groups} />

      {tab === JOBS_TAB ? (
        <JobsSummary jobs={jobs} />
      ) : (
        <BoardTable
          rows={rows}
          emptyTitle={filterLabel ? `No ${TAB_LABELS[tab].toLowerCase()} sanctions match` : `No ${TAB_LABELS[tab].toLowerCase()} sanctions`}
          emptyDescription={filterLabel ? `Nothing for ${filterLabel}. Clear the filters to see everything.` : tab === "open" ? "Nobody owes anything right now." : undefined}
        />
      )}
    </>
  );
}
