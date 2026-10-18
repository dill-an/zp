import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Dues" };

export default function DuesPage() {
  return (
    <>
      <PageHeader title="Dues" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
