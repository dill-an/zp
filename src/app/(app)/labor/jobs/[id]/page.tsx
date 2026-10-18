import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { requirePermission } from "@/lib/auth";
import { countJobTypeAssignments, getJobType } from "@/lib/queries/labor";
import { JobTypeForm } from "../../_components/job-type-form";
import { LaborTabs } from "../../_components/labor-tabs";

export const metadata = { title: "Edit job type | Labor" };

export default async function EditJobTypePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("labor.manage");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const jobType = getJobType(Number(id));
  if (!jobType) notFound();
  const uses = countJobTypeAssignments(jobType.id);
  return (
    <>
      <PageHeader
        eyebrow="Job types"
        title={jobType.name}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusPill status={jobType.isActive ? "active" : "inactive"} label={jobType.isActive ? "Active" : "Archived"} />
            <span>assigned {uses} time{uses === 1 ? "" : "s"}</span>
          </span>
        }
      />
      <LaborTabs user={user} active="/labor/jobs" />
      <Card className="max-w-2xl">
        <CardContent className="py-4">
          <JobTypeForm jobType={jobType} />
        </CardContent>
      </Card>
    </>
  );
}
