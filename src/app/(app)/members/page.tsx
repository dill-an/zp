import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPledgeClasses } from "@/lib/queries/common";
import { listMembersMissingClass, searchMembers, summarizeRoster } from "@/lib/queries/members";
import { formatRosterSummary, parseRosterParams, rosterParamsToQuery } from "@/lib/queries/members-logic";
import { MemberLink } from "@/components/member-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { displayName, fullName, initials } from "@/lib/names";
import { RosterFilters } from "./roster-filters";

export const metadata = { title: "Members" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const params = parseRosterParams(sp);
  const canManage = can(user, "members.manage");
  const rows = searchMembers(params);
  const pledgeClasses = listPledgeClasses();
  const summary = summarizeRoster(rows);
  const query = rosterParamsToQuery(params);
  const hasFilters = query.length > 0;
  const missingClass = canManage ? listMembersMissingClass() : [];

  return (
    <>
      <PageHeader
        title="Members"
        description={formatRosterSummary(summary)}
        actions={
          canManage ? (
            <>
              <ButtonLink href="/members/classes" variant="outline" size="sm">
                Pledge classes
              </ButtonLink>
              <ButtonLink href={`/members/export${query ? `?${query}` : ""}`} variant="outline" size="sm" prefetch={false}>
                Export CSV
              </ButtonLink>
              <ButtonLink href="/members/new" size="sm">
                Add member
              </ButtonLink>
            </>
          ) : null
        }
      />

      {missingClass.length > 0 ? (
        <div role="status" data-testid="roster-hygiene" className="mb-4 rounded-lg border border-border bg-warning-soft px-4 py-3 text-sm">
          <p className="font-medium">
            {missingClass.length === 1 ? "1 brother has no pledge class" : `${missingClass.length} brothers have no pledge class`}
          </p>
          <p className="mt-0.5 text-muted">They show as No class on the roster and are left out of the class counts. Set it from their edit page.</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {missingClass.map((m) => (
              <li key={m.id}>
                <Link href={`/members/${m.id}/edit`} className="font-medium hover:underline">
                  {displayName(m)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <RosterFilters key={query} params={params} pledgeClasses={pledgeClasses} hasFilters={hasFilters} />

      {rows.length === 0 ? (
        <EmptyState
          title="No brothers match"
          description={hasFilters ? "Try clearing a filter or searching for part of a name." : "Nobody is on the roster yet."}
          action={
            hasFilters ? (
              <ButtonLink href="/members" variant="outline">
                Clear filters
              </ButtonLink>
            ) : canManage ? (
              <ButtonLink href="/members/new">Add member</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden" data-testid="roster-cards">
            {rows.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <Avatar initials={initials(m)} seed={m.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <MemberLink member={m} className="text-base" />
                      {m.pledgeClass ? <span className="text-xs text-muted">{m.pledgeClass.name}</span> : <Badge tone="neutral">No class</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted">@{m.username}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <StatusPill status={m.status} />
                      {m.laborGroup !== "none" ? <StatusPill status={m.laborGroup} /> : null}
                      {canManage && m.role !== "member" ? <StatusPill status={m.role} /> : null}
                      {m.chairs.map((c) => (
                        <Link key={c.id} href={`/chairs/${c.slug}`}>
                          <Badge tone="primary">{c.name}</Badge>
                        </Link>
                      ))}
                    </div>
                    {m.room || m.phone || m.email ? (
                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted">
                        {m.room ? <span>Room {m.room}</span> : null}
                        {m.phone ? (
                          <a href={`tel:${m.phone}`} className="hover:underline">
                            {m.phone}
                          </a>
                        ) : null}
                        {m.email ? (
                          <a href={`mailto:${m.email}`} className="truncate hover:underline">
                            {m.email}
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block" data-testid="roster-table">
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Class</Th>
                  <Th>Status</Th>
                  <Th>Labor</Th>
                  <Th>Chairs</Th>
                  <Th>Room</Th>
                  <Th>Phone</Th>
                  <Th>Email</Th>
                  {canManage ? <Th>Role</Th> : null}
                </tr>
              </THead>
              <TBody>
                {rows.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <MemberLink member={m} withAvatar />
                        {fullName(m) !== displayName(m) ? <span className="text-xs text-muted">({fullName(m)})</span> : null}
                      </div>
                      <p className="pl-9 text-xs text-muted">@{m.username}</p>
                    </Td>
                    <Td className="whitespace-nowrap">{m.pledgeClass?.name ?? <Badge tone="neutral">No class</Badge>}</Td>
                    <Td>
                      <StatusPill status={m.status} />
                    </Td>
                    <Td>{m.laborGroup !== "none" ? <StatusPill status={m.laborGroup} /> : <span className="text-muted">None</span>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {m.chairs.map((c) => (
                          <Link key={c.id} href={`/chairs/${c.slug}`}>
                            <Badge tone="primary">{c.name}</Badge>
                          </Link>
                        ))}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{m.room ?? ""}</Td>
                    <Td className="whitespace-nowrap">
                      {m.phone ? (
                        <a href={`tel:${m.phone}`} className="hover:underline">
                          {m.phone}
                        </a>
                      ) : null}
                    </Td>
                    <Td>
                      {m.email ? (
                        <a href={`mailto:${m.email}`} className="hover:underline">
                          {m.email}
                        </a>
                      ) : null}
                    </Td>
                    {canManage ? (
                      <Td>
                        <StatusPill status={m.role} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted">
            {rows.length} {rows.length === 1 ? "brother" : "brothers"} shown
            {!params.includeInactive && !params.status ? ". Inactive and alumni are hidden." : "."}
          </p>
        </>
      )}
    </>
  );
}
