import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority } from "@/db/schema";
import type { TaskStatusFilter } from "@/lib/queries/tasks";

export const TABS = ["mine", "open", "chair", "done"] as const;
export type Tab = (typeof TABS)[number];

export type SearchParams = Record<string, string | string[] | undefined>;

export type ParsedFilters = {
  tab: Tab;
  /** Raw chair param ("general" or a numeric string) for re-populating the select. */
  chairParam?: string;
  chairId?: number | "general";
  assigneeId?: number;
  status?: TaskStatusFilter;
  priority?: TaskPriority;
  q?: string;
  /** True when any filter other than the tab is set. */
  active: boolean;
  deleted: boolean;
};

function str(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: string | undefined): number | undefined {
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
}

/** Parse `/tasks` search params. Links from other modules (`?chair=`, `?assignee=`) land on the Open tab. */
export function parseFilters(sp: SearchParams): ParsedFilters {
  const chairParam = str(sp, "chair");
  const chairId = chairParam === "general" ? ("general" as const) : num(chairParam);
  const assigneeId = num(str(sp, "assignee"));
  const statusRaw = str(sp, "status");
  const status =
    statusRaw && ([...TASK_STATUSES, "open", "overdue", "closed"] as string[]).includes(statusRaw) ? (statusRaw as TaskStatusFilter) : undefined;
  const priorityRaw = str(sp, "priority");
  const priority = priorityRaw && (TASK_PRIORITIES as readonly string[]).includes(priorityRaw) ? (priorityRaw as TaskPriority) : undefined;
  const q = str(sp, "q")?.slice(0, 100);
  const active = chairId !== undefined || assigneeId !== undefined || status !== undefined || priority !== undefined || q !== undefined;
  const tabRaw = str(sp, "tab");
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? (tabRaw as Tab) : active ? "open" : "mine";
  return {
    tab,
    chairParam: chairId === undefined ? undefined : chairParam,
    chairId,
    assigneeId,
    status,
    priority,
    q,
    active,
    deleted: str(sp, "deleted") === "1",
  };
}

/** Href for a tab that keeps the current filters. */
export function tabHref(tab: Tab, f: ParsedFilters): string {
  const p = new URLSearchParams();
  p.set("tab", tab);
  if (f.chairParam) p.set("chair", f.chairParam);
  if (f.assigneeId) p.set("assignee", String(f.assigneeId));
  if (f.status) p.set("status", f.status);
  if (f.priority) p.set("priority", f.priority);
  if (f.q) p.set("q", f.q);
  return `/tasks?${p.toString()}`;
}
