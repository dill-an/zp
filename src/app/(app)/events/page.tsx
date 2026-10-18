import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <>
      <PageHeader title="Events" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
