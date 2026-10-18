import { requirePermission } from "@/lib/auth";
import { SANCTION_SOURCES } from "@/db/schema";
import { addDaysISO, dateAtLocalTime, isoToLocalInput, todayISO } from "@/lib/dates";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { PageHeader } from "@/components/ui/page-header";
import { SanctionForm } from "../_components/sanction-form";

export const metadata = { title: "Issue sanction" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NewSanctionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("sanctions.manage");
  const sp = await searchParams;
  const memberParam = Array.isArray(sp.member) ? sp.member[0] : sp.member;
  const sourceParam = Array.isArray(sp.source) ? sp.source[0] : sp.source;
  const memberId = memberParam && /^\d+$/.test(memberParam) ? Number(memberParam) : null;
  const source = sourceParam && (SANCTION_SOURCES as readonly string[]).includes(sourceParam) ? sourceParam : "manual";
  const groups = groupByPledgeClass(listMembers({ activeOnly: true })).map((g) => ({
    label: g.label,
    members: g.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName })),
  }));
  // Default: one week from today at 11:59 PM house time.
  const dueAtLocal = isoToLocalInput(dateAtLocalTime(addDaysISO(todayISO(), 7), "23:59"));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Issue a sanction" description="Assign a punishment job, work hours or a fine. The brother sees it under My sanctions right away." />
      <SanctionForm mode="create" groups={groups} sources={SANCTION_SOURCES} defaults={{ memberId, source, dueAtLocal }} cancelHref="/sanctions" />
    </div>
  );
}
