import { MAINTENANCE_PRIORITIES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { countMaintenanceByTab, listMaintenance } from "@/lib/queries/community";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { MAINTENANCE_TABS, type MaintenanceTab } from "@/lib/queries/community-logic";
import { Dialog, EmptyState, LinkTabs, PageHeader } from "@/components/ui";
import { MaintenanceForm } from "./report-form";
import { RequestCard } from "./request-card";

export const metadata = { title: "Maintenance" };

function href(tab: MaintenanceTab): string {
  return tab === "open" ? "/maintenance" : `/maintenance?tab=${tab}`;
}

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: MaintenanceTab = MAINTENANCE_TABS.includes(tabParam as MaintenanceTab) ? (tabParam as MaintenanceTab) : "open";
  const manage = can(user, "maintenance.manage");
  const list = listMaintenance(tab);
  const counts = countMaintenanceByTab();
  const groups = manage ? groupByPledgeClass(listMembers({ activeOnly: true })) : [];

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Something broken? Report it here so the house manager can get it fixed."
        actions={
          <Dialog trigger="Report an issue" title="Report an issue">
            <MaintenanceForm priorities={MAINTENANCE_PRIORITIES} />
          </Dialog>
        }
      />
      <LinkTabs
        tabs={[
          { href: href("open"), label: "Open", count: counts.open },
          { href: href("in_progress"), label: "In progress", count: counts.in_progress },
          { href: href("resolved"), label: "Resolved", count: counts.resolved },
        ]}
        active={href(tab)}
      />
      {list.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "Nothing open" : tab === "in_progress" ? "Nothing in progress" : "Nothing resolved yet"}
          description={tab === "open" ? "No open requests. If something is broken, report it." : tab === "in_progress" ? "No one is working on anything right now." : "Fixed and closed requests will show up here."}
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <RequestCard key={r.id} request={r} manage={manage} groups={groups} />
          ))}
        </div>
      )}
    </>
  );
}
