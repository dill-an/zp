import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ChairForm } from "../chair-form";

export const metadata = { title: "Add chair" };

export default async function NewChairPage() {
  await requirePermission("chairs.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Chairs" title="Add chair" description="A new officer position. Assign a holder from the chair's page once it exists." />
      <ChairForm chair={null} cancelHref="/chairs" />
    </div>
  );
}
