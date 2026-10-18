import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCalendarItems, type CalendarItem } from "@/lib/queries/community";
import { currentMonth, inMonth, monthGrid, monthKey, monthTitle, parseMonthKey, shiftMonth } from "@/lib/queries/community-logic";
import { addDaysISO, dateAtLocalTime, dayName, formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { ButtonLink, Card, CardContent, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

const DOW = [0, 1, 2, 3, 4, 5, 6];

function timeOf(iso: string): string {
  return formatDateTime(iso).split(" at ")[1] ?? "";
}

function chipClass(item: CalendarItem): string {
  return item.type === "meeting" ? "bg-info-soft text-info" : item.isMandatory ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-strong";
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { year, month } = parseMonthKey(sp.month) ?? currentMonth();
  const grid = monthGrid(year, month);
  const firstDay = grid[0][0];
  const lastDay = grid[grid.length - 1][6];
  const items = getCalendarItems(dateAtLocalTime(firstDay, "00:00"), dateAtLocalTime(addDaysISO(lastDay, 1), "00:00"));
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) (byDate.get(item.date) ?? byDate.set(item.date, []).get(item.date)!).push(item);
  const today = todayISO();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const thisMonth = currentMonth();
  const monthDays = grid.flat().filter((d) => inMonth(d, year, month));
  const daysWithItems = monthDays.filter((d) => byDate.has(d));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/events" className="hover:underline">
            Events
          </Link>
        }
        title={monthTitle(year, month)}
        description="Events and house meetings. Tap one to open it."
        actions={
          <>
            <ButtonLink href={`/events/calendar?month=${monthKey(prev.year, prev.month)}`} variant="outline" aria-label="Previous month">
              Previous
            </ButtonLink>
            <ButtonLink href={`/events/calendar?month=${monthKey(thisMonth.year, thisMonth.month)}`} variant="ghost">
              Today
            </ButtonLink>
            <ButtonLink href={`/events/calendar?month=${monthKey(next.year, next.month)}`} variant="outline" aria-label="Next month">
              Next
            </ButtonLink>
            {can(user, "events.manage") ? <ButtonLink href="/events/new">New event</ButtonLink> : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
          {DOW.map((d) => (
            <div key={d} className="py-1.5">
              <span className="sm:hidden">{dayName(d, true).charAt(0)}</span>
              <span className="hidden sm:inline">{dayName(d, true)}</span>
            </div>
          ))}
        </div>
        <div role="grid" aria-label={`${monthTitle(year, month)} calendar`}>
          {grid.map((week, wi) => (
            <div key={wi} role="row" className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((date) => {
                const dayItems = byDate.get(date) ?? [];
                const current = inMonth(date, year, month);
                const isToday = date === today;
                return (
                  <div
                    key={date}
                    role="gridcell"
                    data-date={date}
                    className={cn("min-h-14 border-r border-border p-1 last:border-r-0 sm:min-h-24", !current && "bg-surface-2/50 text-muted")}
                  >
                    <div className={cn("mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday && "bg-primary font-semibold text-on-primary")}>
                      {Number(date.slice(8, 10))}
                    </div>
                    {dayItems.length ? (
                      <>
                        <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                          {dayItems.slice(0, 4).map((item) => (
                            <span key={`${item.type}-${item.id}`} className={cn("h-1.5 w-1.5 rounded-full", item.type === "meeting" ? "bg-info" : item.isMandatory ? "bg-danger" : "bg-primary")} />
                          ))}
                        </div>
                        <ul className="hidden space-y-0.5 sm:block">
                          {dayItems.map((item) => (
                            <li key={`${item.type}-${item.id}`}>
                              <Link href={item.href} className={cn("block truncate rounded px-1 py-0.5 text-[11px] font-medium hover:underline", chipClass(item))} title={`${timeOf(item.startsAt)} ${item.title}`}>
                                <span className="opacity-75">{timeOf(item.startsAt)}</span> {item.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary" /> Event
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-danger" /> Mandatory event
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-info" /> House meeting
        </span>
      </div>

      <section className="mt-6 sm:hidden" aria-label="Day by day">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Day by day</h2>
        {daysWithItems.length === 0 ? (
          <EmptyState title="Nothing this month" description="No events or meetings are scheduled." />
        ) : (
          <div className="space-y-3">
            {daysWithItems.map((date) => (
              <Card key={date}>
                <CardContent className="py-2.5">
                  <p className={cn("mb-1 text-sm font-semibold", date === today && "text-primary-strong")}>
                    {formatDate(date, { weekday: true })}
                    {date === today ? " (today)" : ""}
                  </p>
                  <ul className="space-y-1">
                    {(byDate.get(date) ?? []).map((item) => (
                      <li key={`${item.type}-${item.id}`} className="flex items-center gap-2 text-sm">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", item.type === "meeting" ? "bg-info" : item.isMandatory ? "bg-danger" : "bg-primary")} />
                        <span className="w-16 shrink-0 text-muted">{timeOf(item.startsAt)}</span>
                        <Link href={item.href} className="min-w-0 truncate font-medium hover:underline">
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
