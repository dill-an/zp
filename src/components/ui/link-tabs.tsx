import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = { href: string; label: string; count?: number };

/** Server-rendered tab strip; pass the active href. */
export function LinkTabs({ tabs, active, className }: { tabs: LinkTab[]; active: string; className?: string }) {
  return (
    <nav className={cn("mb-4 flex gap-1 overflow-x-auto border-b border-border", className)} aria-label="Sections">
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              isActive ? "border-primary text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count != null ? <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
