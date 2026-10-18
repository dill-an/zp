"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { nextWeekStart, previousWeekStart } from "@/lib/queries/labor-logic";
import { cn } from "@/lib/utils";

type WeekOption = { weekStart: string; isPublished: boolean };

/** Previous / next Sunday links, a select of existing weeks and a "This week" shortcut. */
export function WeekNav({ weekStart, weeks, currentWeekStart, manage }: { weekStart: string; weeks: WeekOption[]; currentWeekStart: string; manage: boolean }) {
  const router = useRouter();
  const suffix = manage ? "?manage=1" : "";
  const href = (ws: string) => `/labor/week/${ws}${suffix}`;
  const options: WeekOption[] = [...weeks];
  if (!options.some((w) => w.weekStart === weekStart)) options.push({ weekStart, isPublished: true });
  if (!options.some((w) => w.weekStart === currentWeekStart)) options.push({ weekStart: currentWeekStart, isPublished: true });
  options.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Week">
      <Link href={href(previousWeekStart(weekStart))} className={buttonClasses("outline", "sm")} aria-label="Previous week">
        <span aria-hidden>‹</span> Prev
      </Link>
      <select
        aria-label="Pick a week"
        value={weekStart}
        onChange={(e) => router.push(href(e.target.value))}
        className="h-8 min-w-0 max-w-full flex-1 rounded-md border border-border bg-surface px-2 text-sm sm:flex-none"
      >
        {options.map((w) => (
          <option key={w.weekStart} value={w.weekStart}>
            {formatDate(w.weekStart, { year: true })}
            {w.weekStart === currentWeekStart ? " (this week)" : ""}
            {!weeks.some((x) => x.weekStart === w.weekStart) ? " (not created)" : w.isPublished ? "" : " (draft)"}
          </option>
        ))}
      </select>
      <Link href={href(nextWeekStart(weekStart))} className={buttonClasses("outline", "sm")} aria-label="Next week">
        Next <span aria-hidden>›</span>
      </Link>
      <Link href={manage ? "/labor?manage=1" : "/labor"} className={cn(buttonClasses("ghost", "sm"), weekStart === currentWeekStart && "text-muted")}>
        This week
      </Link>
    </nav>
  );
}
