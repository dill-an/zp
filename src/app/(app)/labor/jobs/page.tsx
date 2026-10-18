import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { deleteJobType, setJobTypeActive } from "@/lib/actions/labor";
import { requirePermission } from "@/lib/auth";
import { countJobTypeAssignments, listJobTypes } from "@/lib/queries/labor";
import { categoryLabel } from "@/lib/queries/labor-logic";
import { humanize } from "@/lib/utils";
import { ActionForm } from "../_components/action-form";
import { LaborTabs } from "../_components/labor-tabs";

export const metadata = { title: "Job types | Labor" };

export default async function JobTypesPage() {
  const user = await requirePermission("labor.manage");
  const types = listJobTypes({ includeInactive: true });
  const rows = types.map((jt) => ({ jt, uses: countJobTypeAssignments(jt.id) }));
  const active = rows.filter((r) => r.jt.isActive);
  const archived = rows.filter((r) => !r.jt.isActive);

  const table = (list: typeof rows) => (
    <Table>
      <THead>
        <tr>
          <Th>Job</Th>
          <Th>Category</Th>
          <Th>Window</Th>
          <Th className="text-right">Start</Th>
          <Th className="text-right">Due</Th>
          <Th className="text-right">Slots</Th>
          <Th className="text-right">Points</Th>
          <Th className="text-right">Used</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </THead>
      <TBody>
        {list.map(({ jt, uses }) => (
          <Tr key={jt.id} data-jobtype={jt.name}>
            <Td>
              <Link href={`/labor/jobs/${jt.id}`} className="font-medium hover:underline">
                {jt.name}
              </Link>
              <div className="text-xs text-muted">
                {humanize(jt.kind)}
                {jt.instructions ? ` · ${jt.instructions}` : ""}
              </div>
            </Td>
            <Td>{categoryLabel(jt.category)}</Td>
            <Td>{jt.windowLabel ?? ""}</Td>
            <Td className="text-right tabular-nums">+{jt.startOffsetDays}d</Td>
            <Td className="text-right tabular-nums">+{jt.dueOffsetDays}d</Td>
            <Td className="text-right tabular-nums">{jt.slots}</Td>
            <Td className="text-right tabular-nums">{jt.points}</Td>
            <Td className="text-right tabular-nums">{uses}</Td>
            <Td>
              <div className="flex flex-wrap justify-end gap-1.5">
                <ButtonLink href={`/labor/jobs/${jt.id}`} variant="outline" size="sm">
                  Edit
                </ButtonLink>
                {jt.isActive ? (
                  <ActionForm action={setJobTypeActive} hidden={{ id: jt.id, active: "0" }}>
                    <SubmitButton variant="ghost" size="sm" pendingText="Saving…">
                      Archive
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm action={setJobTypeActive} hidden={{ id: jt.id, active: "1" }}>
                    <SubmitButton variant="ghost" size="sm" pendingText="Saving…">
                      Restore
                    </SubmitButton>
                  </ActionForm>
                )}
                {uses === 0 ? (
                  <ActionForm action={deleteJobType} hidden={{ id: jt.id }}>
                    <ConfirmButton variant="danger" size="sm" confirmText={`Delete ${jt.name}? It has never been assigned.`}>
                      Delete
                    </ConfirmButton>
                  </ActionForm>
                ) : null}
              </div>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <PageHeader
        title="Job types"
        description="The cleans, cook shifts and duties that make up a labor week. Offsets are days after the week's Sunday."
        actions={<ButtonLink href="/labor/jobs/new">New job type</ButtonLink>}
      />
      <LaborTabs user={user} active="/labor/jobs" />
      {rows.length === 0 ? (
        <EmptyState title="No job types yet" description="Add the cleans and shifts you hand out each week." action={<ButtonLink href="/labor/jobs/new">New job type</ButtonLink>} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              Active <span className="text-sm font-normal text-muted">({active.length})</span>
            </h2>
            {active.length ? table(active) : <p className="text-sm text-muted">No active job types; restore one or add a new one.</p>}
          </section>
          {archived.length ? (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">
                Archived <span className="text-sm font-normal text-muted">({archived.length})</span> <StatusPill status="inactive" label="Hidden from new weeks" />
              </h2>
              {table(archived)}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
