import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Sanctions" };

export default function SanctionsPage() {
  return (
    <>
      <PageHeader title="Sanctions" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
