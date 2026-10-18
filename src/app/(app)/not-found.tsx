import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return <EmptyState title="Not found" description="That page or record does not exist." action={<ButtonLink href="/dashboard" variant="outline">Back to dashboard</ButtonLink>} />;
}
