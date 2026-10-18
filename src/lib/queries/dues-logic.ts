/**
 * Pure dues logic: balances, statuses, payment plan installments, CSV helpers.
 * No database access so it can be unit tested.
 */
import { parseDollarsToCents } from "@/lib/money";

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

/**
 * Payments and credits (negative charges) are applied to positive charges in due-date order (earliest first,
 * undated last). Returns the due date of the first charge that is not fully covered, or null.
 */
export function earliestUnpaidDue(charges: ChargeLike[], paidCents: number): string | null {
  const credits = charges.filter((c) => c.amountCents < 0).reduce((total, c) => total - c.amountCents, 0);
  let available = paidCents + credits;
  const owed = charges.filter((c) => c.amountCents > 0).sort((a, b) => compareDueDates(a.dueDate, b.dueDate));
  for (const charge of owed) {
    if (available >= charge.amountCents) {
      available -= charge.amountCents;
      continue;
    }
    return charge.dueDate ?? null;
  }
  return null;
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
export type LedgerPayment = { id: number; amountCents: number; periodId: number | null; paidAt: string; method: string; reference: string | null };

export type LedgerEntry = {
  type: "charge" | "payment";
  id: number;
  /** ISO instant used for ordering (charge createdAt or payment paidAt). */
  at: string;
  periodId: number | null;
  /** Positive increases what the member owes; payments are negative. */
  deltaCents: number;
  runningBalanceCents: number;
  label: string;
  detail: string | null;
  dueDate: string | null;
};

/** Chronological ledger with a running balance. Charges sort before payments at the same instant. */
export function buildLedger(charges: LedgerCharge[], payments: LedgerPayment[]): LedgerEntry[] {
  const entries: Omit<LedgerEntry, "runningBalanceCents">[] = [
    ...charges.map((c) => ({
      type: "charge" as const,
      id: c.id,
      at: c.createdAt,
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
      periodId: p.periodId ?? null,
      deltaCents: -p.amountCents,
      label: "Payment",
      detail: p.reference ? `${p.method} ${p.reference}` : p.method,
      dueDate: null,
    })),
  ];
  entries.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    if (a.type !== b.type) return a.type === "charge" ? -1 : 1;
    return a.id - b.id;
  });
  let running = 0;
  return entries.map((e) => {
    running += e.deltaCents;
    return { ...e, runningBalanceCents: running };
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
