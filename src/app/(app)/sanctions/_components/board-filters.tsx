import Link from "next/link";
import { MemberSelect } from "@/components/member-select";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { SANCTION_SOURCES } from "@/db/schema";
import { SOURCE_LABELS } from "./format";
import type { MemberGroup } from "./sanction-form";

export type BoardQuery = { tab: string; member: string; source: string; q: string };

/** GET filter bar for the standards board; keeps the current tab. */
export function BoardFilters({ query, groups }: { query: BoardQuery; groups: MemberGroup[] }) {
  const hasFilter = !!(query.member || query.source || query.q);
  return (
    <form method="get" action="/sanctions" className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" role="search" aria-label="Filter sanctions">
      <input type="hidden" name="tab" value={query.tab} />
      <MemberSelect name="member" groups={groups} placeholder="All brothers" defaultValue={query.member} aria-label="Brother" />
      <Select name="source" defaultValue={query.source} aria-label="Source">
        <option value="">All sources</option>
        {SANCTION_SOURCES.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s] ?? s}
          </option>
        ))}
      </Select>
      <Input name="q" type="search" placeholder="Search reason, job, notes" defaultValue={query.q} aria-label="Search" />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
          Filter
        </Button>
        {hasFilter ? (
          <Link href={`/sanctions?tab=${encodeURIComponent(query.tab)}`} className={buttonClasses("ghost")}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
