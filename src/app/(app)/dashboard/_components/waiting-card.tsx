import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import type { WaitingItem, WaitingKind } from "@/lib/queries/dashboard-logic";
import { cn } from "@/lib/utils";
import { DashCard } from "./dash-card";

const KIND_LABELS: Record<WaitingKind, string> = {
  swap_for_me: "Swap request",
  swap_open: "Open swap",
  swap_decided: "Swap decided",
  excuse_decided: "Excuse decided",
  sanction: "Sanction",
  task: "Task",
  duty: "Event duty",
};

/**
 * "Waiting on you": requests addressed to the brother, things that just landed on them and
 * decisions on their own requests. Each row goes to the page where the action happens.
 * Renders nothing when there is nothing waiting.
 */
export function WaitingCard({ items, className }: { items: WaitingItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <DashCard title="Waiting on you" count={items.length} className={cn("border-primary/40", className)} testId="waiting-card">
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} data-waiting-kind={item.kind}>
            <Link href={item.href} className="group flex items-center gap-3 py-2 hover:bg-surface-2 sm:-mx-2 sm:rounded-md sm:px-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.tone as Tone}>{KIND_LABELS[item.kind]}</Badge>
                  <span className="font-medium group-hover:underline">{item.title}</span>
                </div>
                <p className="text-sm text-muted">{item.detail}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}
