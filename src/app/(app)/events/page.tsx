import Link from "next/link";
import { EVENT_KINDS, type EventKind } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listEvents } from "@/lib/queries/community";
import { EVENT_TABS, type EventTab } from "@/lib/queries/community-logic";
import { ButtonLink, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { cn, humanize } from "@/lib/utils";
import { EventCard } from "./event-card";

export const metadata = { title: "Events" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function href(tab: EventTab, kind?: EventKind): string {
  const params = new URLSearchParams();
  if (tab !== "upcoming") params.set("tab", tab);
  if (kind) params.set("kind", kind);
  const qs = params.toString();
  return qs ? `/events?${qs}` : "/events";
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tabParam = first(sp.tab);
  const tab: EventTab = EVENT_TABS.includes(tabParam as EventTab) ? (tabParam as EventTab) : "upcoming";
  const kindParam = first(sp.kind);
  const kind = EVENT_KINDS.includes(kindParam as EventKind) ? (kindParam as EventKind) : undefined;
  const manage = can(user, "events.manage");
  const list = listEvents({ tab, kind, viewerId: user.id });

  return (
    <>
      <PageHeader
        title="Events"
        description="Socials, rush, philanthropy and everything else on the house calendar."
        actions={
          <>
            <ButtonLink href="/events/calendar" variant="outline">
              Calendar
            </ButtonLink>
            {manage ? <ButtonLink href="/events/new">New event</ButtonLink> : null}
          </>
        }
      />
      <LinkTabs
        tabs={[
          { href: href("upcoming", kind), label: "Upcoming" },
          { href: href("past", kind), label: "Past" },
        ]}
        active={href(tab, kind)}
      />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Filter by kind">
        {[undefined, ...EVENT_KINDS].map((k) => {
          const active = k === kind;
          return (
            <Link
              key={k ?? "all"}
              href={href(tab, k)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
                active ? "border-primary bg-primary-soft text-primary-strong" : "border-border text-muted hover:text-text",
              )}
            >
              {k ? humanize(k) : "All kinds"}
            </Link>
          );
        })}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={tab === "upcoming" ? "No upcoming events" : "No past events"}
          description={kind ? `Nothing ${tab === "upcoming" ? "coming up" : "on record"} for ${humanize(kind).toLowerCase()} events.` : tab === "upcoming" ? "Nothing on the calendar yet." : "Past events will show up here."}
          action={manage && tab === "upcoming" ? <ButtonLink href="/events/new">Plan one</ButtonLink> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <EventCard key={e.id} event={e} manage={manage} />
          ))}
        </div>
      )}
    </>
  );
}
