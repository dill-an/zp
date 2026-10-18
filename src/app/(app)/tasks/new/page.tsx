import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createTask } from "@/lib/actions/tasks";
import { canManageChair } from "@/lib/permissions";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { getChairById, listChairSummaries } from "@/lib/queries/tasks";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "../task-form";
import type { SearchParams } from "../filters";

export const metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const chairParam = typeof sp.chair === "string" && /^\d+$/.test(sp.chair) ? Number(sp.chair) : undefined;
  const assigneeParam = typeof sp.assignee === "string" && /^\d+$/.test(sp.assignee) ? Number(sp.assignee) : undefined;

  const manageable = listChairSummaries()
    .filter((c) => canManageChair(user, c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  const preselectedChair = chairParam && manageable.some((c) => c.id === chairParam) ? getChairById(chairParam) : null;
  const memberGroups = groupByPledgeClass(listMembers({ activeOnly: true })).map((g) => ({
    label: g.label,
    members: g.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName, username: m.username, status: m.status })),
  }));
  const allIds = new Set(memberGroups.flatMap((g) => g.members.map((m) => m.id)));
  const assigneeIds = assigneeParam && allIds.has(assigneeParam) ? [assigneeParam] : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={preselectedChair ? `/tasks?tab=chair&chair=${preselectedChair.id}` : "/tasks"} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> Tasks
          </Link>
        }
        title="New task"
        description={preselectedChair ? `For the ${preselectedChair.name} board.` : manageable.length ? "Pick a chair to put it on that board, or leave it General." : "Tasks you create here are General, and you can assign them to yourself or to other brothers."}
      />
      <div className="max-w-3xl">
        <TaskForm
          action={createTask}
          chairs={manageable}
          memberGroups={memberGroups}
          currentUserId={user.id}
          defaults={{ chairId: preselectedChair?.id ?? null, assigneeIds, priority: "normal", recurrence: "none" }}
          submitLabel="Create task"
          cancelHref={preselectedChair ? `/tasks?tab=chair&chair=${preselectedChair.id}` : "/tasks"}
          mode="create"
        />
      </div>
    </>
  );
}
