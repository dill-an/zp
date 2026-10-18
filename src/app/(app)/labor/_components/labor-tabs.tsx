import { LinkTabs, type LinkTab } from "@/components/ui/link-tabs";
import type { CurrentUser } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { getPendingLaborCounts } from "@/lib/queries/labor";

/** Section tabs shared by every labor page. `active` is the tab href, e.g. "/labor/me". */
export function LaborTabs({ user, active }: { user: CurrentUser; active: string }) {
  const tabs: LinkTab[] = [
    { href: "/labor", label: "This week" },
    { href: "/labor/me", label: "My jobs" },
    { href: "/labor/brothers", label: "Brothers" },
    { href: "/labor/stats", label: "Stats" },
    { href: "/labor/swaps", label: "Swaps" },
  ];
  if (can(user, "labor.manage")) {
    const counts = getPendingLaborCounts();
    tabs.push({ href: "/labor/verify", label: "Verify" });
    tabs.push({ href: "/labor/excuses", label: "Excuses", count: counts.excuses || undefined });
    tabs.push({ href: "/labor/jobs", label: "Job types" });
    const swaps = tabs.find((t) => t.href === "/labor/swaps");
    if (swaps && counts.swaps) swaps.count = counts.swaps;
  }
  return <LinkTabs tabs={tabs} active={active} />;
}
