import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth";
import { JobTypeForm } from "../../_components/job-type-form";
import { LaborTabs } from "../../_components/labor-tabs";

export const metadata = { title: "New job type | Labor" };

export default async function NewJobTypePage() {
  const user = await requirePermission("labor.manage");
  return (
    <>
      <PageHeader eyebrow="Job types" title="New job type" />
      <LaborTabs user={user} active="/labor/jobs" />
      <Card className="max-w-2xl">
        <CardContent className="py-4">
          <JobTypeForm />
        </CardContent>
      </Card>
    </>
  );
}
