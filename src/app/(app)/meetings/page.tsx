import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Meetings" };

export default function MeetingsPage() {
  return (
    <>
      <PageHeader title="Meetings" />
      <EmptyState title="Coming soon" description="This section is being built." />
    </>
  );
}
