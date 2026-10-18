/**
 * Pure sanction logic (no db, no server-only) so it can be unit tested.
 *
 * A sanction is a punishment job, fine or work-hours penalty issued to one brother.
 * Status flow: open -> in_progress -> completed -> verified, with side exits to
 * appealed (brother asks for review) and waived (manager cancels it). Reopen
 * sends any non-open status back to open.
 */
import type { SanctionStatus } from "@/db/schema";

/** Settings key holding the posted standards policy text. */
export const SANCTIONS_POLICY_KEY = "sanctions_policy";
export const DEFAULT_POLICY = "Standards policy not posted yet.";

/** Split policy text into paragraphs (blank-line separated), dropping empties. */
export function policyParagraphs(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [DEFAULT_POLICY];
  return t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Minimal shape the logic needs; db rows and test fixtures both satisfy it. */
export type SanctionLike = {
  id: number;
  memberId: number;
  status: SanctionStatus;
  source: string;
  reason: string;
  jobDescription?: string | null;
  hours?: number | null;
  fineCents?: number | null;
  dueAt?: string | null;
  issuedAt?: string;
  notes?: string | null;
  /** Optional display name of the member, used by the free-text filter. */
  memberName?: string | null;
};

export type FineChargeLike = {
  sanctionId: number | null;
  kind: string;
  amountCents: number;
};

export const SANCTION_TABS = ["open", "to_verify", "appealed", "verified", "waived", "all"] as const;
export type SanctionTab = (typeof SANCTION_TABS)[number];

export const TAB_LABELS: Record<SanctionTab, string> = {
  open: "Open",
  to_verify: "To verify",
  appealed: "Appealed",
  verified: "Verified",
  waived: "Waived",
  all: "All",
};

/** Statuses shown on each board tab. */
export const TAB_STATUSES: Record<SanctionTab, readonly SanctionStatus[]> = {
  open: ["open", "in_progress"],
  to_verify: ["completed"],
  appealed: ["appealed"],
  verified: ["verified"],
  waived: ["waived"],
  all: ["open", "in_progress", "completed", "verified", "waived", "appealed"],
};

/** Statuses where the brother still owes the job (or the fine is still contested). */
export const OUTSTANDING_STATUSES: readonly SanctionStatus[] = ["open", "in_progress", "appealed"];

export function isSanctionTab(value: string | null | undefined): value is SanctionTab {
  return !!value && (SANCTION_TABS as readonly string[]).includes(value);
}

export function isOutstanding(s: Pick<SanctionLike, "status">): boolean {
  return OUTSTANDING_STATUSES.includes(s.status);
}

/** Past its due instant and the job has not been done, verified or waived. */
export function isOverdue(s: Pick<SanctionLike, "status" | "dueAt">, now: Date = new Date()): boolean {
  if (!s.dueAt) return false;
  if (!isOutstanding(s)) return false;
  const due = Date.parse(s.dueAt);
  if (Number.isNaN(due)) return false;
  return due < now.getTime();
}

export type SanctionStats = {
  /** open + in_progress */
  open: number;
  /** outstanding and past due */
  overdue: number;
  /** completed, waiting on a manager */
  toVerify: number;
  appealed: number;
  /** hours still owed on outstanding sanctions */
  outstandingHours: number;
  /** cents of fines on non-waived sanctions (linked fine charges, falling back to fineCents when no charge row exists) */
  outstandingFines: number;
  total: number;
};

/**
 * Board headline numbers. `fineCharges` are the `charges` rows with a `sanctionId`;
 * a sanction that has fine charges counts their sum, one without (e.g. inserted by
 * another module) counts its own `fineCents`.
 */
export function sanctionStats(list: readonly SanctionLike[], fineCharges: readonly FineChargeLike[] = [], now: Date = new Date()): SanctionStats {
  const fineBySanction = new Map<number, number>();
  for (const c of fineCharges) {
    if (c.sanctionId == null || c.kind !== "fine") continue;
    fineBySanction.set(c.sanctionId, (fineBySanction.get(c.sanctionId) ?? 0) + c.amountCents);
  }
  const stats: SanctionStats = { open: 0, overdue: 0, toVerify: 0, appealed: 0, outstandingHours: 0, outstandingFines: 0, total: list.length };
  for (const s of list) {
    if (s.status === "open" || s.status === "in_progress") stats.open += 1;
    if (s.status === "completed") stats.toVerify += 1;
    if (s.status === "appealed") stats.appealed += 1;
    if (isOverdue(s, now)) stats.overdue += 1;
    if (isOutstanding(s)) stats.outstandingHours += s.hours ?? 0;
    if (s.status !== "waived") {
      const linked = fineBySanction.get(s.id);
      stats.outstandingFines += linked ?? s.fineCents ?? 0;
    }
  }
  return stats;
}

export type SanctionFilters = {
  memberId?: number | null;
  source?: string | null;
  /** Free text matched against reason, job, notes and member name (case-insensitive). */
  q?: string | null;
};

/** Apply a board tab plus the optional member/source/text filters. */
export function filterSanctions<T extends SanctionLike>(list: readonly T[], tab: SanctionTab, filters: SanctionFilters = {}): T[] {
  const statuses = TAB_STATUSES[tab] ?? TAB_STATUSES.all;
  const q = filters.q?.trim().toLowerCase() ?? "";
  return list.filter((s) => {
    if (!statuses.includes(s.status)) return false;
    if (filters.memberId != null && s.memberId !== filters.memberId) return false;
    if (filters.source && s.source !== filters.source) return false;
    if (q) {
      const hay = [s.reason, s.jobDescription ?? "", s.notes ?? "", s.memberName ?? ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_RANK: Record<SanctionStatus, number> = {
  in_progress: 0,
  open: 1,
  appealed: 2,
  completed: 3,
  verified: 4,
  waived: 5,
};

/**
 * Work-first ordering: outstanding items first (soonest due at the top, undated last),
 * then completed, verified and waived with the newest issued first.
 */
export function sortSanctions<T extends SanctionLike>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    const outstandingA = isOutstanding(a);
    const outstandingB = isOutstanding(b);
    if (outstandingA !== outstandingB) return outstandingA ? -1 : 1;
    if (outstandingA) {
      // Both outstanding: due soonest first; undated at the bottom; then status rank.
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
      if (!!a.dueAt !== !!b.dueAt) return a.dueAt ? -1 : 1;
      if (ra !== rb) return ra - rb;
    } else if (ra !== rb) {
      return ra - rb;
    }
    const ia = a.issuedAt ?? "";
    const ib = b.issuedAt ?? "";
    if (ia !== ib) return ia > ib ? -1 : 1;
    return b.id - a.id;
  });
}

/** Split one brother's sanctions into the three sections of the "My sanctions" page. */
export function splitForMember<T extends SanctionLike>(list: readonly T[]): { active: T[]; awaiting: T[]; history: T[] } {
  const sorted = sortSanctions(list);
  return {
    active: sorted.filter((s) => isOutstanding(s)),
    awaiting: sorted.filter((s) => s.status === "completed"),
    history: sorted.filter((s) => s.status === "verified" || s.status === "waived"),
  };
}

export type SanctionAction = "start" | "complete" | "appeal" | "verify" | "waive" | "reopen" | "edit" | "delete";

/**
 * Which buttons a viewer gets for a sanction. The brother it belongs to can start,
 * complete and appeal; a `sanctions.manage` holder can verify, waive, reopen, edit and delete.
 */
export function allowedActions(status: SanctionStatus, viewer: { isOwner: boolean; isManager: boolean }): SanctionAction[] {
  const out: SanctionAction[] = [];
  if (viewer.isOwner) {
    if (status === "open") out.push("start");
    if (status === "open" || status === "in_progress") out.push("complete", "appeal");
  }
  if (viewer.isManager) {
    if (status === "open" || status === "in_progress" || status === "completed" || status === "appealed") out.push("verify", "waive");
    if (status !== "open") out.push("reopen");
    out.push("edit", "delete");
  }
  return out;
}

/** Status after a given action, or null when the action is not legal from that status. */
export function nextStatus(status: SanctionStatus, action: Exclude<SanctionAction, "edit" | "delete">): SanctionStatus | null {
  switch (action) {
    case "start":
      return status === "open" ? "in_progress" : null;
    case "complete":
      return status === "open" || status === "in_progress" ? "completed" : null;
    case "appeal":
      return status === "open" || status === "in_progress" ? "appealed" : null;
    case "verify":
      return status === "open" || status === "in_progress" || status === "completed" || status === "appealed" ? "verified" : null;
    case "waive":
      return status === "open" || status === "in_progress" || status === "completed" || status === "appealed" ? "waived" : null;
    case "reopen":
      return status !== "open" ? "open" : null;
  }
}

export type JobSummary = {
  /** Normalized job description (trimmed); "No job (fine or hours only)" for sanctions without one. */
  job: string;
  total: number;
  /** verified + completed */
  done: number;
  outstanding: number;
  waived: number;
  /** Members (by id, deduplicated) who still owe this job, soonest due first. */
  pending: { memberId: number; memberName: string | null; dueAt: string | null; status: SanctionStatus; sanctionId: number }[];
};

export const NO_JOB_LABEL = "No job (fine or hours only)";

/**
 * "What punishment jobs there are and how many people have done them": group by
 * job description and count who has done each one and who still needs to.
 */
export function summarizeJobs(list: readonly SanctionLike[]): JobSummary[] {
  const groups = new Map<string, JobSummary>();
  for (const s of sortSanctions(list)) {
    const key = (s.jobDescription ?? "").trim() || NO_JOB_LABEL;
    let g = groups.get(key);
    if (!g) {
      g = { job: key, total: 0, done: 0, outstanding: 0, waived: 0, pending: [] };
      groups.set(key, g);
    }
    g.total += 1;
    if (s.status === "verified" || s.status === "completed") g.done += 1;
    else if (s.status === "waived") g.waived += 1;
    else if (isOutstanding(s)) {
      g.outstanding += 1;
      g.pending.push({ memberId: s.memberId, memberName: s.memberName ?? null, dueAt: s.dueAt ?? null, status: s.status, sanctionId: s.id });
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.job === NO_JOB_LABEL) return 1;
    if (b.job === NO_JOB_LABEL) return -1;
    if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding;
    if (a.total !== b.total) return b.total - a.total;
    return a.job.localeCompare(b.job);
  });
}

/** Append an appeal reason to existing notes, dated, without losing what was there. */
export function appendAppealNote(notes: string | null | undefined, reason: string, when: string): string {
  const line = `Appeal (${when.slice(0, 10)}): ${reason.trim()}`;
  const existing = notes?.trim() ?? "";
  return existing ? `${existing}\n\n${line}` : line;
}
