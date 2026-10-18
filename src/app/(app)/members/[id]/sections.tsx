/**
 * Placeholder profile sections. The integrator replaces the bodies with each module's real
 * summary; keep the props as `{ memberId: number; viewer: CurrentUser }`.
 */
import type { CurrentUser } from "@/lib/permissions";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type ProfileSectionProps = { memberId: number; viewer: CurrentUser };

export async function LaborSection({ memberId }: ProfileSectionProps) {
  return (
    <EmptyState
      title="Labor and cleans"
      description="Weekly jobs, completion history and fairness stats live in the labor module."
      action={
        <ButtonLink href={`/labor/brothers/${memberId}`} variant="outline" size="sm">
          View labor
        </ButtonLink>
      }
    />
  );
}

export async function TasksSection({ memberId }: ProfileSectionProps) {
  return (
    <EmptyState
      title="Tasks"
      description="Open tasks assigned to this brother live in the tasks module."
      action={
        <ButtonLink href={`/tasks?assignee=${memberId}`} variant="outline" size="sm">
          View tasks
        </ButtonLink>
      }
    />
  );
}

export async function DuesSection({ memberId }: ProfileSectionProps) {
  return (
    <EmptyState
      title="Dues"
      description="Balance, charges and payments live in the dues module."
      action={
        <ButtonLink href={`/dues/members/${memberId}`} variant="outline" size="sm">
          View dues
        </ButtonLink>
      }
    />
  );
}

export async function AttendanceSection({ memberId }: ProfileSectionProps) {
  return (
    <EmptyState
      title="Meeting attendance"
      description="House meeting attendance and excuses live in the meetings module."
      action={
        <ButtonLink href={`/meetings/attendance?member=${memberId}`} variant="outline" size="sm">
          View attendance
        </ButtonLink>
      }
    />
  );
}

export async function SanctionsSection({ memberId }: ProfileSectionProps) {
  return (
    <EmptyState
      title="Sanctions"
      description="Punishment jobs, fines and work hours live in the sanctions module."
      action={
        <ButtonLink href={`/sanctions?member=${memberId}`} variant="outline" size="sm">
          View sanctions
        </ButtonLink>
      }
    />
  );
}
