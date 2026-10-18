"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Briefcase,
  Calendar,
  CheckSquare,
  Contact,
  DollarSign,
  Gavel,
  Home,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Sparkles,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { NAV_GROUPS } from "./nav-items";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  megaphone: Megaphone,
  calendar: Calendar,
  users: Users,
  sparkles: Sparkles,
  "check-square": CheckSquare,
  briefcase: Briefcase,
  gavel: Gavel,
  wrench: Wrench,
  contact: Contact,
  dollar: DollarSign,
  settings: Settings,
};

export type ShellUser = { id: number; name: string; initials: string; roleLabel: string };

export function AppShell({ user, chapterName, logoutAction, children }: { user: ShellUser; chapterName: string; logoutAction: () => Promise<void>; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label || "misc"}>
          {group.label ? <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Home;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium",
                      active ? "bg-primary-soft text-primary-strong" : "text-text hover:bg-surface-2",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-border px-3 py-3">
      <div className="flex items-center gap-2.5">
        <Avatar initials={user.initials} seed={user.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.roleLabel}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-xs font-bold text-on-primary">ZΨ</span>
          <span className="font-semibold">{chapterName}</span>
        </div>
        {nav}
        {userBlock}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-semibold">{chapterName}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded p-1.5 hover:bg-surface-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {userBlock}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1.5 hover:bg-surface-2">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="font-semibold">
            {chapterName}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
