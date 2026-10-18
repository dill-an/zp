import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listPledgeClassesWithCounts } from "@/lib/queries/members";
import { deletePledgeClassForm } from "@/lib/actions/members";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { PledgeClassDialog } from "./class-dialog";

export const metadata = { title: "Pledge classes" };

export default async function PledgeClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("members.manage");
  const sp = await searchParams;
  const classes = listPledgeClassesWithCounts();
  const flash = typeof sp.error === "string" ? { ok: false as const, error: sp.error } : typeof sp.ok === "string" ? { ok: true as const, message: sp.ok } : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href="/members" className="hover:underline">
            Members
          </Link>
        }
        title="Pledge classes"
        description="Oldest class first. A class can only be deleted once nobody is in it."
        actions={<PledgeClassDialog pledgeClass={null} />}
      />
      {flash ? <FormMessage result={flash} className="mb-4" /> : null}
      {classes.length === 0 ? (
        <EmptyState title="No pledge classes yet" description="Add the first class to start grouping brothers." action={<PledgeClassDialog pledgeClass={null} />} />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Semester</Th>
              <Th className="text-right">Members</Th>
              <Th className="text-right">Order</Th>
              <Th>Notes</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </THead>
          <TBody>
            {classes.map((pc) => (
              <Tr key={pc.id}>
                <Td className="font-medium">
                  <Link href={`/members?class=${pc.id}&all=1`} className="hover:underline">
                    {pc.name}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{pc.semesterLabel ?? <span className="text-muted">None</span>}</Td>
                <Td className="text-right tabular-nums">{pc.memberCount}</Td>
                <Td className="text-right tabular-nums">{pc.sortOrder}</Td>
                <Td className="max-w-xs truncate text-muted">{pc.notes ?? ""}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <PledgeClassDialog pledgeClass={pc} />
                    {pc.memberCount === 0 ? (
                      <form action={deletePledgeClassForm}>
                        <input type="hidden" name="id" value={pc.id} />
                        <ConfirmButton confirmText={`Delete pledge class ${pc.name}?`} variant="outline">
                          Delete
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
