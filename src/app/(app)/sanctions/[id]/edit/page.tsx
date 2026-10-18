import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { SANCTION_SOURCES } from "@/db/schema";
import { isoToLocalInput } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { displayName } from "@/lib/names";
import { getSanction } from "@/lib/queries/sanctions";
import { PageHeader } from "@/components/ui/page-header";
import { SanctionForm } from "../../_components/sanction-form";

export const metadata = { title: "Edit sanction" };

export default async function EditSanctionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("sanctions.manage");
  const { id } = await params;
  const sanctionId = /^\d+$/.test(id) ? Number(id) : NaN;
  const s = Number.isInteger(sanctionId) ? getSanction(sanctionId) : null;
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={`Sanction #${s.id}`} title="Edit sanction" description="Changing the fine updates the linked charge on their dues ledger." />
      <SanctionForm
        mode="edit"
        id={s.id}
        groups={[]}
        sources={SANCTION_SOURCES}
        memberName={displayName(s.member)}
        defaults={{
          memberId: s.memberId,
          reason: s.reason,
          jobDescription: s.jobDescription,
          hours: s.hours,
          fineDollars: s.fineCents ? centsToInput(s.fineCents) : "",
          source: s.source,
          dueAtLocal: isoToLocalInput(s.dueAt),
          notes: s.notes,
        }}
        cancelHref={`/sanctions/${s.id}`}
      />
    </div>
  );
}
