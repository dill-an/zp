import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <>
      <PageHeader title="Maintenance" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
