import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Labor" };

export default function LaborPage() {
  return (
    <>
      <PageHeader title="Labor" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
