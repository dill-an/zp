import Link from "next/link";
import { Filter } from "lucide-react";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/db/schema";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { MemberSelect } from "@/components/member-select";
import { humanize } from "@/lib/utils";
import type { TaskPerson } from "@/lib/queries/tasks";
import type { ParsedFilters } from "./filters";

export type FilterChair = { id: number; name: string };

/** GET form that narrows every tab. Collapsed behind a toggle on phones. */
export function TaskFilters({
  filters,
  tab,
  chairs,
  memberGroups,
  hideAssignee = false,
}: {
  filters: ParsedFilters;
  tab: string;
  chairs: FilterChair[];
  memberGroups: { label: string; members: TaskPerson[] }[];
  hideAssignee?: boolean;
}) {
  const active = filters.active;
  const clearHref = `/tasks?tab=${tab}`;
  return (
    <details className="mb-4 rounded-lg border border-border bg-surface" open={active}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted" aria-hidden />
          Filters
          {active ? <span className="rounded-full bg-primary-soft px-1.5 text-xs text-primary-strong">on</span> : null}
        </span>
        {active ? (
          <Link href={clearHref} className="text-xs font-normal text-muted hover:underline">
            Clear
          </Link>
        ) : null}
      </summary>
      <form method="get" action="/tasks" className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" placeholder="Search titles" defaultValue={filters.q ?? ""} aria-label="Search titles" className="lg:col-span-2" />
        <Select name="chair" defaultValue={filters.chairParam ?? ""} aria-label="Chair">
          <option value="">Any chair</option>
          <option value="general">General (no chair)</option>
          {chairs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {hideAssignee ? null : (
          <MemberSelect name="assignee" groups={memberGroups} placeholder="Anyone" defaultValue={filters.assigneeId ?? ""} aria-label="Assignee" />
        )}
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status">
          <option value="">{tab === "done" ? "Done" : "Any open"}</option>
          <option value="overdue">Overdue</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select name="priority" defaultValue={filters.priority ?? ""} aria-label="Priority">
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {humanize(p)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {active ? (
            <ButtonLink href={clearHref} size="sm" variant="ghost">
              Clear filters
            </ButtonLink>
          ) : null}
        </div>
      </form>
    </details>
  );
}
