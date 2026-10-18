"use client";

import { useRouter } from "next/navigation";
import { useRef, type FormEvent } from "react";
import { LABOR_GROUPS, MEMBER_STATUSES, type PledgeClass } from "@/db/schema";
import type { RosterParams } from "@/lib/queries/members-logic";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { humanize } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  new_member: "New member",
  abroad: "Abroad",
  inactive: "Inactive",
  alumni: "Alumni",
};

/** Roster filter bar: navigates to /members?... on submit or when a select/checkbox changes. */
export function RosterFilters({ params, pledgeClasses, hasFilters }: { params: RosterParams; pledgeClasses: PledgeClass[]; hasFilters: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const navigate = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const qs = new URLSearchParams();
    for (const [k, value] of data.entries()) {
      if (typeof value !== "string" || !value) continue;
      qs.set(k, value);
    }
    const s = qs.toString();
    router.push(s ? `/members?${s}` : "/members");
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate();
  };

  return (
    <form ref={formRef} method="get" action="/members" onSubmit={onSubmit} className="mb-4 space-y-2" role="search" aria-label="Filter members">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" type="search" placeholder="Search name or username" defaultValue={params.q ?? ""} aria-label="Search" autoComplete="off" />
        <Select name="status" defaultValue={params.status ?? ""} onChange={navigate} aria-label="Status">
          <option value="">Any status</option>
          {MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] ?? humanize(s)}
            </option>
          ))}
        </Select>
        <Select name="class" defaultValue={params.pledgeClassId != null ? String(params.pledgeClassId) : ""} onChange={navigate} aria-label="Pledge class">
          <option value="">Any class</option>
          {pledgeClasses.map((pc) => (
            <option key={pc.id} value={pc.id}>
              {pc.name}
            </option>
          ))}
        </Select>
        <Select name="group" defaultValue={params.laborGroup ?? ""} onChange={navigate} aria-label="Labor group">
          <option value="">Any labor group</option>
          {LABOR_GROUPS.map((g) => (
            <option key={g} value={g}>
              {humanize(g)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox name="chairs" value="1" defaultChecked={!!params.chairHoldersOnly} onChange={navigate} />
          Chair holders only
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="all" value="1" defaultChecked={!!params.includeInactive} onChange={navigate} />
          Include inactive and alumni
        </label>
        {hasFilters ? (
          <ButtonLink href="/members" variant="ghost" size="sm">
            Clear filters
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
