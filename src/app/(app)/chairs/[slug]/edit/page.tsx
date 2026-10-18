import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getChairDetail } from "@/lib/queries/chairs";
import { PageHeader } from "@/components/ui/page-header";
import { ChairForm } from "../../chair-form";

export const metadata = { title: "Edit chair" };

export default async function EditChairPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("chairs.manage");
  const { slug } = await params;
  const detail = getChairDetail(slug);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Chairs" title={`Edit ${detail.chair.name}`} />
      <ChairForm chair={detail.chair} cancelHref={`/chairs/${detail.chair.slug}`} />
    </div>
  );
}
