import Link from "next/link";
import { cn } from "@/lib/utils";
import { shortJobName, stateChipClass, type AssignmentState } from "@/lib/queries/labor-logic";
import { formatDate } from "@/lib/dates";

/** Compact job chip for the brothers matrix: short job name coloured by state. */
export function JobChip({ name, state, weekStart, dueDate, windowLabel }: { name: string; state: AssignmentState; weekStart: string; dueDate: string; windowLabel?: string | null }) {
  const label = shortJobName(name);
  return (
    <Link
      href={`/labor/week/${weekStart}`}
      title={`${name}${windowLabel ? ` (${windowLabel})` : ""}, due ${formatDate(dueDate, { weekday: true })}: ${state.replace("_", " ")}`}
      className={cn("inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 hover:opacity-80", stateChipClass(state))}
    >
      {label}
    </Link>
  );
}
