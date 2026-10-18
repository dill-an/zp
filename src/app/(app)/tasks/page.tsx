import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
