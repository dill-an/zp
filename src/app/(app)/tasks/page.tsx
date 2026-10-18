import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canManageChair } from "@/lib/permissions";
import { displayName } from "@/lib/names";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import {
  countOpenTasks,
  countOpenTasksForMember,
  getPerson,
  getTaskCountsByChair,
  listChairSummaries,
  listTasks,
  type ChairSummary,
  type TaskListItem,
  type TaskPerson,
} from "@/lib/queries/tasks";
import { canActOnTask, isOverdue } from "@/lib/queries/tasks-logic";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { MemberLink } from "@/components/member-link";
import { parseFilters, tabHref, type ParsedFilters, type SearchParams } from "./filters";
import { TaskFilters } from "./task-filters";
import { TaskList } from "./task-list";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const now = new Date();
  const chairs = listChairSummaries();
  const memberGroups = groupByPledgeClass(listMembers({ activeOnly: true })).map((g) => ({
    label: g.label,
    members: g.members.map(toPerson),
  }));

  const tabs = [
    { href: tabHref("mine", filters), label: "Mine", count: countOpenTasksForMember(user.id) },
    { href: tabHref("open", filters), label: "Open", count: countOpenTasks() },
    { href: tabHref("chair", filters), label: "By chair" },
    { href: tabHref("done", filters), label: "Done" },
  ];

  const newTaskHref = typeof filters.chairId === "number" && canManageChair(user, filters.chairId) ? `/tasks/new?chair=${filters.chairId}` : "/tasks/new";
  const actionable = (list: TaskListItem[]) =>
    new Set(list.filter((t) => canActOnTask(user, t, t.assignees.map((a) => a.id))).map((t) => t.id));
  const filterChair = typeof filters.chairId === "number" ? chairs.find((c) => c.id === filters.chairId) ?? null : null;
  const filterPerson = filters.assigneeId ? getPerson(filters.assigneeId) : null;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Who is doing what for each chair, due when, done when."
        actions={
          <ButtonLink href={newTaskHref}>
            <Plus className="h-4 w-4" aria-hidden />
            New task
          </ButtonLink>
        }
      />
      {filters.deleted ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Task deleted.
        </p>
      ) : null}
      <LinkTabs tabs={tabs} active={tabHref(filters.tab, filters)} />
      <TaskFilters filters={filters} tab={filters.tab} chairs={chairs} memberGroups={memberGroups} hideAssignee={filters.tab === "mine"} />
      {filterChair || filterPerson || filters.chairId === "general" ? (
        <p className="mb-3 text-sm text-muted">
          Showing tasks
          {filters.chairId === "general" ? " with no chair (General)" : filterChair ? <> for <Link href={`/chairs/${filterChair.slug}`} className="font-medium text-text hover:underline">{filterChair.name}</Link></> : null}
          {filterPerson && filters.tab !== "mine" ? <> assigned to <MemberLink member={filterPerson} className="text-text" /></> : null}.
        </p>
      ) : null}

      {filters.tab === "mine" ? <MineTab user={user} filters={filters} now={now} actionable={actionable} /> : null}
      {filters.tab === "open" ? <OpenTab filters={filters} now={now} actionable={actionable} /> : null}
      {filters.tab === "chair" ? <ByChairTab user={user} filters={filters} now={now} actionable={actionable} chairs={chairs} /> : null}
      {filters.tab === "done" ? <DoneTab filters={filters} now={now} actionable={actionable} /> : null}
    </>
  );
}

type TabProps = {
  filters: ParsedFilters;
  now: Date;
  actionable: (list: TaskListItem[]) => Set<number>;
};

function toPerson(m: TaskPerson): TaskPerson {
  return { id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName, username: m.username, status: m.status };
}

function commonFilters(f: ParsedFilters) {
  return { chairId: f.chairId, priority: f.priority, q: f.q };
}

/** A status filter that selects finished tasks, so rows should show who finished them instead of the due date. */
function isClosedFilter(f: ParsedFilters): boolean {
  return f.status === "done" || f.status === "cancelled" || f.status === "closed";
}

function MineTab({ user, filters, now, actionable }: TabProps & { user: { id: number } }) {
  const open = listTasks({ ...commonFilters(filters), assigneeId: user.id, status: filters.status ?? "open" }, now);
  const showRecent = !filters.status;
  const recent = showRecent ? listTasks({ ...commonFilters(filters), assigneeId: user.id, status: "closed", order: "completed", limit: 10 }, now) : [];
  const overdue = open.filter((t) => isOverdue(t, now)).length;
  const weekEnd = now.getTime() + 7 * 86_400_000;
  const dueThisWeek = open.filter((t) => t.dueAt && Date.parse(t.dueAt) <= weekEnd && !isOverdue(t, now)).length;
  return (
    <div className="space-y-6">
      {!filters.active ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="Open" value={open.length} />
          <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : undefined} />
          <Stat label="Due in 7 days" value={dueThisWeek} tone={dueThisWeek > 0 ? "warning" : undefined} />
        </div>
      ) : null}
      {open.length === 0 ? (
        <EmptyState
          title={filters.active ? "No tasks match these filters" : "Nothing on your plate"}
          description={filters.active ? "Try clearing a filter." : "Tasks assigned to you by a chair, or that you create for yourself, show up here."}
          action={
            <ButtonLink href="/tasks/new" variant="secondary" size="sm">
              Create a task for yourself
            </ButtonLink>
          }
        />
      ) : (
        <TaskList tasks={open} actionableIds={actionable(open)} variant={isClosedFilter(filters) ? "done" : "open"} now={now} />
      )}
      {recent.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recently finished</h2>
          <TaskList tasks={recent} actionableIds={new Set()} variant="done" now={now} />
        </section>
      ) : null}
    </div>
  );
}

function OpenTab({ filters, now, actionable }: TabProps) {
  const list = listTasks({ ...commonFilters(filters), assigneeId: filters.assigneeId, status: filters.status ?? "open" }, now);
  if (list.length === 0) {
    return <EmptyState title="No open tasks" description={filters.active ? "Nothing matches these filters." : "Every task is done. Enjoy it while it lasts."} />;
  }
  return <TaskList tasks={list} actionableIds={actionable(list)} variant={isClosedFilter(filters) ? "done" : "open"} now={now} />;
}

function DoneTab({ filters, now, actionable }: TabProps) {
  const status = filters.status === "cancelled" || filters.status === "closed" ? filters.status : "done";
  const list = listTasks({ ...commonFilters(filters), assigneeId: filters.assigneeId, status, order: "completed", limit: 50 }, now);
  if (list.length === 0) return <EmptyState title="Nothing finished yet" description="Completed tasks show up here with who finished them and when." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Most recent 50, newest first.</p>
      <TaskList tasks={list} actionableIds={actionable(list)} variant="done" now={now} />
    </div>
  );
}

function ByChairTab({ user, filters, now, actionable, chairs }: TabProps & { user: Parameters<typeof canManageChair>[0]; chairs: ChairSummary[] }) {
  const list = listTasks({ ...commonFilters(filters), assigneeId: filters.assigneeId, status: filters.status ?? "open" }, now);
  const counts = getTaskCountsByChair(now);
  const byChair = new Map<number | null, TaskListItem[]>();
  for (const t of list) (byChair.get(t.chairId) ?? byChair.set(t.chairId, []).get(t.chairId)!).push(t);
  const ids = actionable(list);
  const variant = isClosedFilter(filters) ? "done" : "open";

  const groups: { key: string; chairId: number | null; chair: ChairSummary | null; tasks: TaskListItem[] }[] = chairs
    .filter((c) => filters.chairId === undefined || filters.chairId === c.id)
    .map((c) => ({ key: c.slug, chairId: c.id, chair: c, tasks: byChair.get(c.id) ?? [] }));
  if (filters.chairId === undefined || filters.chairId === "general") groups.push({ key: "general", chairId: null, chair: null, tasks: byChair.get(null) ?? [] });
  // Tasks that belong to an inactive chair still need a home.
  for (const [chairId, ts] of byChair) {
    if (chairId != null && !groups.some((g) => g.chairId === chairId)) groups.push({ key: `chair-${chairId}`, chairId, chair: null, tasks: ts });
  }
  const withTasks = groups.filter((g) => g.tasks.length > 0);
  const empty = groups.filter((g) => g.tasks.length === 0);

  if (withTasks.length === 0 && empty.length === 0) return <EmptyState title="No chairs" description="Set up chairs first." />;

  return (
    <div className="space-y-4">
      {withTasks.length === 0 ? <EmptyState title="No open tasks on any board" description={filters.active ? "Nothing matches these filters." : undefined} /> : null}
      {withTasks.map((g) => {
        const c = counts.get(g.chairId) ?? { open: 0, overdue: 0 };
        const canAdd = g.chairId == null || canManageChair(user, g.chairId);
        const name = g.chair?.name ?? (g.chairId == null ? "General" : g.tasks[0]?.chair?.name ?? "Former chair");
        return (
          <Card key={g.key} data-testid="chair-group" data-chair-id={g.chairId ?? "general"}>
            <CardHeader className="items-center">
              <div className="min-w-0">
                <CardTitle>
                  {g.chair ? (
                    <Link href={`/chairs/${g.chair.slug}`} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </CardTitle>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {g.chair ? (
                    g.chair.holders.length ? (
                      <span>
                        Held by{" "}
                        {g.chair.holders.map((h, i) => (
                          <span key={h.id}>
                            {i > 0 ? ", " : ""}
                            <MemberLink member={h} short className="text-text" />
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>No current holder</span>
                    )
                  ) : g.chairId == null ? (
                    <span>Tasks that do not belong to a chair</span>
                  ) : null}
                  <span>
                    {c.open} open{c.overdue > 0 ? <span className="font-semibold text-danger">, {c.overdue} overdue</span> : null}
                  </span>
                </p>
              </div>
              {canAdd ? (
                <ButtonLink href={g.chairId == null ? "/tasks/new" : `/tasks/new?chair=${g.chairId}`} size="sm" variant="secondary">
                  <Plus className="h-4 w-4" aria-hidden />
                  New task
                </ButtonLink>
              ) : null}
            </CardHeader>
            <CardContent className="px-3 py-3 md:px-0 md:py-0">
              <TaskList tasks={g.tasks} actionableIds={ids} variant={variant} hideChair now={now} />
            </CardContent>
          </Card>
        );
      })}
      {empty.length > 0 && !filters.active ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Boards with nothing open</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {empty.map((g) => {
                const canAdd = g.chairId == null || canManageChair(user, g.chairId);
                const name = g.chair?.name ?? "General";
                return (
                  <li key={g.key} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-sm">
                    {g.chair ? (
                      <Link href={`/chairs/${g.chair.slug}`} className="hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span>{name}</span>
                    )}
                    {g.chair?.holders.length ? <span className="text-xs text-muted">({g.chair.holders.map((h) => displayName(h).split(" ")[0]).join(", ")})</span> : null}
                    {canAdd ? (
                      <Link
                        href={g.chairId == null ? "/tasks/new" : `/tasks/new?chair=${g.chairId}`}
                        className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-text"
                        aria-label={`New task for ${name}`}
                        title={`New task for ${name}`}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
