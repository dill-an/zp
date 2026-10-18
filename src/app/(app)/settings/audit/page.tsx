import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { listAuditActors, listAuditEntityTypes, listAuditEntries } from "@/lib/queries/dashboard";
import { auditHref, parseAuditParams } from "@/lib/queries/dashboard-logic";
import { humanize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Audit log" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("audit.view");
  const params = parseAuditParams(await searchParams);
  const result = listAuditEntries(params);
  const actors = listAuditActors();
  const entityTypes = listAuditEntityTypes();
  const filtered = params.actorId != null || !!params.entity || !!params.q;
  const first = result.total ? (result.page - 1) * result.perPage + 1 : 0;
  const last = Math.min(result.total, result.page * result.perPage);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
        }
        title="Audit log"
        description="Every change that matters, newest first."
      />

      <Card className="mb-4">
        <CardContent>
          <form method="get" action="/settings/audit" className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <div className="space-y-1">
              <label htmlFor="actor" className="block text-sm font-medium">
                Who
              </label>
              <Select id="actor" name="actor" defaultValue={params.actorId != null ? String(params.actorId) : ""}>
                <option value="">Anyone</option>
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {displayName(a)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="entity" className="block text-sm font-medium">
                What
              </label>
              <Select id="entity" name="entity" defaultValue={params.entity}>
                <option value="">Anything</option>
                {entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="q" className="block text-sm font-medium">
                Search
              </label>
              <Input id="q" name="q" placeholder="Summary, action or id" defaultValue={params.q} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                Filter
              </Button>
              {filtered ? (
                <ButtonLink href="/settings/audit" variant="ghost">
                  Clear
                </ButtonLink>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="mb-2 text-sm text-muted" data-testid="audit-count">
        {result.total === 0 ? "No entries" : `Showing ${first} to ${last} of ${result.total} entries`}
        {filtered ? " matching your filters" : ""}.
      </p>

      {result.rows.length === 0 ? (
        <EmptyState title="Nothing logged" description={filtered ? "Try fewer filters." : "Actions show up here as brothers use the app."} />
      ) : (
        <Card>
          <ul className="divide-y divide-border" data-testid="audit-list">
            {result.rows.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-start sm:gap-4" data-audit-id={e.id}>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted sm:w-52 sm:pt-0.5">{formatDateTime(e.createdAt, { year: true })}</span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p>{e.summary}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {e.actor ? (
                      <Link href={`/members/${e.actor.id}`} className="font-medium hover:underline">
                        {displayName(e.actor)}
                      </Link>
                    ) : (
                      <span>System</span>
                    )}
                    <Badge>{e.action}</Badge>
                    <span>
                      {humanize(e.entityType)}
                      {e.entityId ? ` #${e.entityId}` : ""}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.pageCount > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Pages">
          {result.page > 1 ? (
            <ButtonLink href={auditHref(params, result.page - 1)} variant="outline" size="sm">
              Newer
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <ButtonLink href={auditHref(params, result.page + 1)} variant="outline" size="sm">
              Older
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
