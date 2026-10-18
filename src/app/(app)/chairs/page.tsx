import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listChairsWithCounts } from "@/lib/queries/chairs";
import { groupChairsByCategory } from "@/lib/queries/members-logic";
import { MemberLink } from "@/components/member-link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Chairs" };

export default async function ChairsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage = can(user, "chairs.manage");
  const showAll = canManage && sp.all === "1";
  const chairs = listChairsWithCounts({ includeInactive: showAll });
  const groups = groupChairsByCategory(chairs);
  const unassigned = chairs.filter((c) => c.isActive && c.holders.length === 0).length;

  return (
    <>
      <PageHeader
        title="Chairs"
        description={
          chairs.length
            ? `${chairs.filter((c) => c.isActive).length} positions${unassigned ? `, ${unassigned} unassigned` : ", all assigned"}`
            : "Officer positions and who holds them."
        }
        actions={
          canManage ? (
            <>
              <ButtonLink href={showAll ? "/chairs" : "/chairs?all=1"} variant="outline" size="sm">
                {showAll ? "Hide inactive" : "Show inactive"}
              </ButtonLink>
              <ButtonLink href="/chairs/new" size="sm">
                Add chair
              </ButtonLink>
            </>
          ) : null
        }
      />

      {chairs.length === 0 ? (
        <EmptyState title="No chairs yet" description="Chairs are the officer positions brothers hold." action={canManage ? <ButtonLink href="/chairs/new">Add chair</ButtonLink> : undefined} />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`chairs-${group.category}`}>
              <h2 id={`chairs-${group.category}`} className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.chairs.map((c) => (
                  <Card key={c.id} className={c.isActive ? undefined : "opacity-70"}>
                    <CardHeader className="items-center">
                      <CardTitle>
                        <Link href={`/chairs/${c.slug}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </CardTitle>
                      <div className="flex gap-1">
                        {c.isExec ? <Badge tone="primary">Exec</Badge> : null}
                        {!c.isActive ? <Badge>Inactive</Badge> : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {c.holders.length === 0 ? (
                          <span className="text-muted">Unassigned</span>
                        ) : (
                          c.holders.map((h) => (
                            <span key={h.id} className="inline-flex items-center gap-1">
                              <MemberLink member={h.member} withAvatar />
                              {h.title ? <span className="text-xs text-muted">({h.title})</span> : null}
                            </span>
                          ))
                        )}
                      </div>
                      {c.description ? <p className="text-sm text-muted">{c.description}</p> : null}
                    </CardContent>
                    <CardFooter className="justify-between text-sm">
                      <Link href={`/tasks?chair=${c.id}`} className="hover:underline">
                        {c.open === 0 ? "No open tasks" : `${c.open} open ${c.open === 1 ? "task" : "tasks"}`}
                        {c.overdue > 0 ? <span className="ml-1.5 text-danger">({c.overdue} overdue)</span> : null}
                      </Link>
                      {canManage ? (
                        <Link href={`/chairs/${c.slug}/edit`} className="text-muted hover:underline">
                          Edit
                        </Link>
                      ) : null}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
