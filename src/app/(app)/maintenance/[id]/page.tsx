import Link from "next/link";
import { notFound } from "next/navigation";
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMaintenanceRequest } from "@/lib/queries/community";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { bodyParagraphs, relativeAge } from "@/lib/queries/community-logic";
import { deleteMaintenanceRequest, setMaintenanceStatus } from "@/lib/actions/community";
import { formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { Button, Card, CardContent, CardHeader, CardTitle, ConfirmButton, PageHeader, StatusPill } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { MaintenanceForm } from "../report-form";
import { AssignForm, StatusForm } from "../manage-forms";

export const metadata = { title: "Maintenance request" };

function Paragraphs({ text, empty }: { text: string | null; empty: string }) {
  const paragraphs = bodyParagraphs(text ?? "");
  if (paragraphs.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-2 text-sm">
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <span key={j}>
              {j > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export default async function MaintenanceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const r = Number.isInteger(id) ? getMaintenanceRequest(id) : null;
  if (!r) notFound();
  const manage = can(user, "maintenance.manage");
  const isReporter = r.reportedById === user.id;
  const isAssignee = r.assignedToId === user.id;
  const canEdit = manage || (isReporter && r.status === "open");
  const groups = manage ? groupByPledgeClass(listMembers({ activeOnly: true })) : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/maintenance" className="hover:underline">
            Maintenance
          </Link>
        }
        title={r.title}
        description={r.location ?? undefined}
        actions={
          manage ? (
            <form
              action={async () => {
                "use server";
                await deleteMaintenanceRequest(r.id);
              }}
            >
              <ConfirmButton confirmText={`Delete "${r.title}"?`} size="md">
                Delete
              </ConfirmButton>
            </form>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="request-status">
        <StatusPill status={r.status} />
        <StatusPill status={r.priority} label={`${humanize(r.priority)} priority`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Paragraphs text={r.description} empty="No details were given." />
              <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Reported by</dt>
                  <dd>
                    {r.reporter ? <MemberLink member={r.reporter} /> : "Unknown"} <span className="text-muted" title={formatDateTime(r.createdAt, { year: true })}>{relativeAge(r.createdAt)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Assigned to</dt>
                  <dd data-testid="assignee">{r.assignee ? <MemberLink member={r.assignee} /> : <span className="text-muted">Nobody yet</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Where</dt>
                  <dd>{r.location || <span className="text-muted">Not given</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">{r.resolvedAt ? "Resolved" : "Last update"}</dt>
                  <dd>{formatDateTime(r.resolvedAt ?? r.updatedAt, { year: true })}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {r.resolutionNotes || r.resolvedAt ? (
            <Card>
              <CardHeader>
                <CardTitle>Resolution</CardTitle>
              </CardHeader>
              <CardContent data-testid="resolution-notes">
                <Paragraphs text={r.resolutionNotes} empty="No notes were left." />
              </CardContent>
            </Card>
          ) : null}

          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit request</CardTitle>
                {!manage ? <p className="text-sm text-muted">You can edit until someone picks it up.</p> : null}
              </CardHeader>
              <CardContent>
                <MaintenanceForm
                  requestId={r.id}
                  priorities={MAINTENANCE_PRIORITIES}
                  initial={{ title: r.title, description: r.description ?? "", location: r.location ?? "", priority: r.priority }}
                  submitLabel="Save changes"
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {manage ? (
            <Card>
              <CardHeader>
                <CardTitle>Manage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <AssignForm requestId={r.id} groups={groups} current={r.assignedToId} />
                <div className="border-t border-border pt-4">
                  <StatusForm requestId={r.id} statuses={MAINTENANCE_STATUSES} current={r.status} notes={r.resolutionNotes} />
                </div>
              </CardContent>
            </Card>
          ) : isAssignee ? (
            <Card>
              <CardHeader>
                <CardTitle>Your job</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {r.status !== "in_progress" && r.status !== "resolved" ? (
                  <form
                    action={async () => {
                      "use server";
                      await setMaintenanceStatus(r.id, "in_progress");
                    }}
                  >
                    <Button type="submit" variant="outline" size="sm">
                      Mark in progress
                    </Button>
                  </form>
                ) : null}
                {r.status !== "resolved" ? (
                  <form
                    action={async () => {
                      "use server";
                      await setMaintenanceStatus(r.id, "resolved");
                    }}
                  >
                    <Button type="submit" size="sm">
                      Mark resolved
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-muted">Nice work. This one is done.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
