/**
 * Pure dues logic: balances, statuses, payment plan installments, CSV helpers.
 * No database access so it can be unit tested.
 */
import { formatDate, toHouseDate } from "@/lib/dates";
import { formatCents, parseDollarsToCents } from "@/lib/money";

export const DUES_STATUSES = ["paid", "partial", "unpaid", "overdue", "none"] as const;
export type DuesStatus = (typeof DUES_STATUSES)[number];

export type ChargeLike = { amountCents: number; periodId?: number | null; dueDate?: string | null };
export type PaymentLike = { amountCents: number; periodId?: number | null };

export type BalanceSummary = {
  chargedCents: number;
  paidCents: number;
  balanceCents: number;
  /** Number of charge rows counted (so a fully credited period still counts as "charged"). */
  chargeCount: number;
  /** Due date of the earliest charge not yet covered by payments and credits (null when nothing is outstanding). */
  earliestUnpaidDue: string | null;
};

/**
 * Does a charge or payment belong to the requested scope?
 * `undefined` = everything (rows without a period count too), `null` = only rows without a period, number = that period.
 */
export function inPeriod(row: { periodId?: number | null }, periodId: number | null | undefined): boolean {
  if (periodId === undefined) return true;
  return (row.periodId ?? null) === periodId;
}

function sumCents(rows: { amountCents: number }[]): number {
  return rows.reduce((total, r) => total + r.amountCents, 0);
}

function compareDueDates(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type Outstanding<T extends ChargeLike> = { charge: T; remainingCents: number };

/**
 * Payments and credits (negative charges) are applied to positive charges in due-date order (earliest first,
 * undated last). Returns the charges that are not fully covered, each with what is still owed on it.
 */
export function outstandingCharges<T extends ChargeLike>(charges: readonly T[], paidCents: number): Outstanding<T>[] {
  const credits = charges.filter((c) => c.amountCents < 0).reduce((total, c) => total - c.amountCents, 0);
  let available = paidCents + credits;
  const owed = charges.filter((c) => c.amountCents > 0).sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
  const out: Outstanding<T>[] = [];
  for (const charge of owed) {
    if (available >= charge.amountCents) {
      available -= charge.amountCents;
      continue;
    }
    out.push({ charge, remainingCents: charge.amountCents - available });
    available = 0;
  }
  return out;
}

/** Due date of the first charge that is not fully covered (see outstandingCharges), or null. */
export function earliestUnpaidDue(charges: ChargeLike[], paidCents: number): string | null {
  return outstandingCharges(charges, paidCents)[0]?.charge.dueDate ?? null;
}

/* ------------------------------------------------------------------ */
/* "You owe" line                                                       */
/* ------------------------------------------------------------------ */

/** One thing a brother still has to pay: what is left on a charge, or the next installment of an approved plan. */
export type DueItem = {
  /** Charge kind ("dues", "fine", ...) or "plan" for a payment plan installment. */
  kind: string;
  /** Short wording for the headline: "fine", "late fee", "Fall 2026 dues", "Fall 2026 plan installment". */
  label: string;
  dueDate: string | null;
  remainingCents: number;
  periodId: number | null;
  /** How many charges this item stands for (same-day fines merge; see mergeDueItems). Absent means one. */
  count?: number;
};

/** Kinds whose same-day items merge into one, with the plural used for the merged wording. */
const MERGED_KINDS: Record<string, string> = { fine: "fines", late_fee: "late fees" };

/** Headline wording for a charge: fines and late fees by kind, everything else by its own description. */
export function dueItemLabel(charge: { kind: string; description: string }): string {
  switch (charge.kind) {
    case "fine":
      return "fine";
    case "late_fee":
      return "late fee";
    default:
      return charge.description.trim() || charge.kind;
  }
}

/** Outstanding charges of one scope as due items (same allocation as earliestUnpaidDue). */
export function dueItemsFor<T extends ChargeLike & { kind: string; description: string }>(charges: readonly T[], paidCents: number): DueItem[] {
  return outstandingCharges(charges, paidCents).map(({ charge, remainingCents }) => ({
    kind: charge.kind,
    label: dueItemLabel(charge),
    dueDate: charge.dueDate ?? null,
    remainingCents,
    periodId: charge.periodId ?? null,
  }));
}

/** Soonest due first, undated last; ties keep their order. */
export function sortDueItems(items: readonly DueItem[]): DueItem[] {
  return [...items].sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
}

/**
 * Fines (and late fees) that fall on the same day collapse into one item, so three sanction fines due Friday read
 * "$32.50 in 3 fines due Oct 25" instead of three "fine" entries. Other kinds stay separate; order is kept.
 */
export function mergeDueItems(items: readonly DueItem[]): DueItem[] {
  const out: DueItem[] = [];
  for (const item of items) {
    const target = item.kind in MERGED_KINDS ? out.find((o) => o.kind === item.kind && o.dueDate === item.dueDate) : undefined;
    if (target) {
      target.remainingCents += item.remainingCents;
      target.count = (target.count ?? 1) + (item.count ?? 1);
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

/**
 * Pieces of the "You owe" line, one per due item: "$25.00 fine due Oct 23", "$450.00 Fall 2026 dues due Nov 1".
 * Dates outside the current year get the year. At most `max` items; the rest collapse into "2 more".
 */
export function dueLineParts(items: readonly DueItem[], today: string, max = 3): string[] {
  const shown = items.slice(0, max);
  const parts = shown.map((item) => {
    const amount = formatCents(item.remainingCents);
    const count = item.count ?? 1;
    const what = count > 1 ? `in ${count} ${MERGED_KINDS[item.kind] ?? item.label}` : item.label;
    if (!item.dueDate) return `${amount} ${what}`;
    return `${amount} ${what} due ${formatDate(item.dueDate, { year: item.dueDate.slice(0, 4) !== today.slice(0, 4) })}`;
  });
  const more = items.length - shown.length;
  if (more > 0) parts.push(`${more} more`);
  return parts;
}

/** Balance for one member: sum(charges) - sum(payments), optionally restricted to a period. */
export function computeBalance(charges: ChargeLike[], payments: PaymentLike[], periodId?: number | null): BalanceSummary {
  const scopedCharges = charges.filter((c) => inPeriod(c, periodId));
  const scopedPayments = payments.filter((p) => inPeriod(p, periodId));
  const chargedCents = sumCents(scopedCharges);
  const paidCents = sumCents(scopedPayments);
  return {
    chargedCents,
    paidCents,
    balanceCents: chargedCents - paidCents,
    chargeCount: scopedCharges.length,
    earliestUnpaidDue: earliestUnpaidDue(scopedCharges, paidCents),
  };
}

/**
 * Status for a member within a scope:
 * paid (nothing outstanding and something was charged), partial (some paid), unpaid (nothing paid),
 * overdue (outstanding and the earliest unpaid charge is past due), none (nothing charged).
 */
export function memberStatus(
  input: { chargedCents: number; balanceCents: number; earliestUnpaidDue: string | null; chargeCount?: number },
  today: string,
): DuesStatus {
  const hasCharges = (input.chargeCount ?? 0) > 0 || input.chargedCents !== 0;
  if (!hasCharges && input.balanceCents >= 0) return "none";
  if (input.balanceCents <= 0) return "paid";
  if (input.earliestUnpaidDue && input.earliestUnpaidDue < today) return "overdue";
  if (input.balanceCents >= input.chargedCents) return "unpaid";
  return "partial";
}

/**
 * Status across several scopes (e.g. every period a member has activity in).
 * Overdue anywhere wins; otherwise paid when nothing is owed in total; "unpaid" when nothing has been paid
 * toward any outstanding scope; "partial" when some of what is still owed has been paid.
 */
export function overallStatus(scopes: { status: DuesStatus; balanceCents: number }[]): DuesStatus {
  const active = scopes.filter((s) => s.status !== "none");
  if (active.length === 0) return "none";
  const total = active.reduce((sum, s) => sum + s.balanceCents, 0);
  if (total <= 0) return "paid";
  if (active.some((s) => s.status === "overdue")) return "overdue";
  const owing = active.filter((s) => s.balanceCents > 0);
  if (owing.length === 0) return "paid";
  return owing.every((s) => s.status === "unpaid") ? "unpaid" : "partial";
}

/** Tone for big numbers and stats. */
export function statusTone(status: DuesStatus): "success" | "warning" | "danger" | "info" | undefined {
  switch (status) {
    case "paid":
      return "success";
    case "partial":
      return "warning";
    case "unpaid":
      return "warning";
    case "overdue":
      return "danger";
    default:
      return undefined;
  }
}

/** Short human label for a status. */
export function statusLabel(status: DuesStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "unpaid":
      return "Unpaid";
    case "overdue":
      return "Overdue";
    default:
      return "Nothing due";
  }
}

/* ------------------------------------------------------------------ */
/* Payment plans                                                        */
/* ------------------------------------------------------------------ */

export type Installment = { dueDate: string; amountCents: number };

export type NextInstallment = Installment & {
  index: number;
  /** How much of this installment is still unpaid after earlier payments are applied. */
  remainingCents: number;
  overdue: boolean;
};

/** Parse the JSON stored in payment_plans.installments_json; invalid data yields an empty list. */
export function parseInstallmentsJson(json: string | null | undefined): Installment[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Installment => typeof x === "object" && x !== null && typeof (x as Installment).dueDate === "string" && typeof (x as Installment).amountCents === "number")
      .map((x) => ({ dueDate: x.dueDate, amountCents: x.amountCents }))
      .sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
  } catch {
    return [];
  }
}

/** The first installment not covered by what has been paid so far, or null when the plan is fully paid. */
export function nextInstallment(installments: Installment[], paidCents: number, today: string): NextInstallment | null {
  const sorted = [...installments].sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
  let available = Math.max(0, paidCents);
  for (let i = 0; i < sorted.length; i++) {
    const inst = sorted[i];
    if (available >= inst.amountCents) {
      available -= inst.amountCents;
      continue;
    }
    return { ...inst, index: i, remainingCents: inst.amountCents - available, overdue: inst.dueDate < today };
  }
  return null;
}

export type InstallmentFormRow = { dueDate?: string | null; amount?: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn form rows (date + dollars) into installments. Blank rows are skipped. Requires between `min` and `max` rows
 * (default 3 to 6), valid dates, positive amounts, and, when `totalCents` is given, a sum equal to it.
 */
export function parseInstallments(
  rows: InstallmentFormRow[],
  opts: { min?: number; max?: number; totalCents?: number } = {},
): { ok: true; installments: Installment[] } | { ok: false; error: string } {
  const min = opts.min ?? 3;
  const max = opts.max ?? 6;
  const installments: Installment[] = [];
  for (let i = 0; i < rows.length; i++) {
    const dueDate = (rows[i].dueDate ?? "").trim();
    const amount = (rows[i].amount ?? "").trim();
    if (!dueDate && !amount) continue;
    if (!DATE_RE.test(dueDate)) return { ok: false, error: `Row ${i + 1}: enter a date.` };
    const cents = parseDollarsToCents(amount);
    if (cents == null) return { ok: false, error: `Row ${i + 1}: enter a dollar amount.` };
    if (cents <= 0) return { ok: false, error: `Row ${i + 1}: amount must be more than $0.` };
    installments.push({ dueDate, amountCents: cents });
  }
  if (installments.length < min) return { ok: false, error: `A plan needs at least ${min} installments.` };
  if (installments.length > max) return { ok: false, error: `A plan can have at most ${max} installments.` };
  installments.sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
  if (opts.totalCents != null) {
    const sum = installments.reduce((t, i) => t + i.amountCents, 0);
    if (sum !== opts.totalCents) {
      return { ok: false, error: `Installments add up to ${dollars(sum)} but the balance is ${dollars(opts.totalCents)}.` };
    }
  }
  return { ok: true, installments };
}

function dollars(cents: number): string {
  const abs = Math.abs(cents);
  const str = `$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents < 0 ? `-${str}` : str;
}

/* ------------------------------------------------------------------ */
/* Ledger                                                               */
/* ------------------------------------------------------------------ */

export type LedgerCharge = { id: number; amountCents: number; periodId: number | null; dueDate: string | null; createdAt: string; kind: string; description: string };
export type LedgerPayment = { id: number; amountCents: number; periodId: number | null; paidAt: string; method: string; reference: string | null; createdAt?: string };

export type LedgerEntry = {
  type: "charge" | "payment";
  id: number;
  /** ISO instant the row is dated (charge createdAt or payment paidAt). */
  at: string;
  /** House calendar date ("YYYY-MM-DD") of `at`; the ledger is ordered by this first. */
  date: string;
  periodId: number | null;
  /** Positive increases what the member owes; payments are negative. */
  deltaCents: number;
  runningBalanceCents: number;
  label: string;
  detail: string | null;
  dueDate: string | null;
};

/**
 * Chronological ledger (oldest first) with a running balance. Rows are ordered by house calendar date, then charges
 * before payments on the same day, then by when the row was recorded, then id. A payment is stored at a fixed time of
 * its day while a charge keeps the instant it was created, so ordering by the raw instant would put a same-day payment
 * ahead of the charges it pays for and show a negative balance after it. Callers render it reversed (newest first).
 */
export function buildLedger(charges: LedgerCharge[], payments: LedgerPayment[]): LedgerEntry[] {
  type Pending = Omit<LedgerEntry, "runningBalanceCents"> & { recordedAt: string };
  const entries: Pending[] = [
    ...charges.map((c) => ({
      type: "charge" as const,
      id: c.id,
      at: c.createdAt,
      date: toHouseDate(c.createdAt),
      recordedAt: c.createdAt,
      periodId: c.periodId ?? null,
      deltaCents: c.amountCents,
      label: c.description,
      detail: c.kind,
      dueDate: c.dueDate ?? null,
    })),
    ...payments.map((p) => ({
      type: "payment" as const,
      id: p.id,
      at: p.paidAt,
      date: toHouseDate(p.paidAt),
      recordedAt: p.createdAt ?? p.paidAt,
      periodId: p.periodId ?? null,
      deltaCents: -p.amountCents,
      label: "Payment",
      detail: p.reference ? `${p.method} ${p.reference}` : p.method,
      dueDate: null,
    })),
  ];
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.type !== b.type) return a.type === "charge" ? -1 : 1;
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
    return a.id - b.id;
  });
  let running = 0;
  return entries.map((e) => {
    running += e.deltaCents;
    return { type: e.type, id: e.id, at: e.at, date: e.date, periodId: e.periodId, deltaCents: e.deltaCents, runningBalanceCents: running, label: e.label, detail: e.detail, dueDate: e.dueDate };
  });
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

/** Quote a CSV cell when it contains a comma, quote, newline or surrounding whitespace. */
export function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\r\n]/.test(str) || str !== str.trim()) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Rows to a CSV document with CRLF line endings. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/** Cents as a plain decimal for spreadsheets: 123456 -> "1234.56". */
export function centsToCsv(cents: number): string {
  return (cents / 100).toFixed(2);
}
