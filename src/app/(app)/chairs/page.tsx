import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Chairs" };

export default function ChairsPage() {
  return (
    <>
      <PageHeader title="Chairs" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
