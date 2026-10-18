import { requirePermission } from "@/lib/auth";
import { listPledgeClasses } from "@/lib/queries/common";
import { PageHeader } from "@/components/ui/page-header";
import { MemberForm } from "../member-form";

export const metadata = { title: "Add member" };

export default async function NewMemberPage() {
  const user = await requirePermission("members.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Members" title="Add member" description="Create an account for a new brother. Give them the temporary password in person." />
      <MemberForm member={null} pledgeClasses={listPledgeClasses()} canManage isAdmin={user.role === "admin"} isSelf={false} cancelHref="/members" />
    </div>
  );
}
