import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { updateTask } from "@/lib/actions/tasks";
import { isoToLocalInput } from "@/lib/dates";
import { canManageChair } from "@/lib/permissions";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { getTask, listChairSummaries } from "@/lib/queries/tasks";
import { canEditTask } from "@/lib/queries/tasks-logic";
import { PageHeader } from "@/components/ui/page-header";
import { TaskForm } from "../../task-form";

export const metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const task = getTask(Number(id));
  if (!task) notFound();
  if (!canEditTask(user, task)) redirect(`/tasks/${task.id}`);

  // Chairs the user may file this under, plus the current chair so an unchanged save keeps it.
  const chairs = listChairSummaries()
    .filter((c) => canManageChair(user, c.id) || c.id === task.chairId)
    .map((c) => ({ id: c.id, name: c.name }));
  const current = task.chair;
  if (current && !chairs.some((c) => c.id === current.id)) chairs.push({ id: current.id, name: current.name });
  const memberGroups = groupByPledgeClass(listMembers({ activeOnly: true })).map((g) => ({
    label: g.label,
    members: g.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, preferredName: m.preferredName, username: m.username, status: m.status })),
  }));
  // Keep assignees who are no longer active visible so an edit does not silently drop them.
  for (const a of task.assignees) {
    if (!memberGroups.some((g) => g.members.some((m) => m.id === a.id))) {
      const group = memberGroups.find((g) => g.label === "No longer active") ?? memberGroups[memberGroups.push({ label: "No longer active", members: [] }) - 1];
      group.members.push(a);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/tasks/${task.id}`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3 w-3" aria-hidden /> {task.title}
          </Link>
        }
        title="Edit task"
      />
      <div className="max-w-3xl">
        <TaskForm
          action={updateTask.bind(null, task.id)}
          chairs={chairs}
          memberGroups={memberGroups}
          currentUserId={user.id}
          defaults={{
            title: task.title,
            description: task.description ?? "",
            chairId: task.chairId,
            assigneeIds: task.assignees.map((a) => a.id),
            dueAtLocal: isoToLocalInput(task.dueAt),
            priority: task.priority,
            recurrence: task.recurrence,
            checklistText: task.checklistItems.map((i) => i.label).join("\n"),
            tags: task.tags ?? "",
          }}
          submitLabel="Save changes"
          cancelHref={`/tasks/${task.id}`}
          mode="edit"
        />
      </div>
    </>
  );
}
