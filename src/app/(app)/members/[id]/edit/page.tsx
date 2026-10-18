import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMember, listPledgeClasses } from "@/lib/queries/common";
import { displayName } from "@/lib/names";
import { PageHeader } from "@/components/ui/page-header";
import { MemberForm } from "../../member-form";

export const metadata = { title: "Edit member" };

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const raw = (await params).id;
  if (!/^\d+$/.test(raw)) notFound();
  const member = getMember(Number(raw));
  if (!member) notFound();
  const canManage = can(viewer, "members.manage");
  const isSelf = viewer.id === member.id;
  if (!canManage && !isSelf) redirect("/dashboard?denied=members.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Members" title={isSelf && !canManage ? "Edit my profile" : `Edit ${displayName(member)}`} />
      <MemberForm member={member} pledgeClasses={listPledgeClasses()} canManage={canManage} isAdmin={viewer.role === "admin"} isSelf={isSelf} cancelHref={`/members/${member.id}`} />
    </div>
  );
}
