import { StatusPill } from "@/components/ui/status-pill";
import { statePill, type AssignmentState } from "@/lib/queries/labor-logic";

/** Status pill for an assignment's derived state (upcoming, overdue, verified, ...). */
export function AssignmentStatePill({ state, className }: { state: AssignmentState; className?: string }) {
  const { status, label } = statePill(state);
  return <StatusPill status={status} label={label} className={className} />;
}
