import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  charges,
  duesPeriods,
  members,
  paymentPlans,
  payments,
  pledgeClasses,
  type Charge,
  type DuesPeriod,
  type Payment,
  type PaymentPlan,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { getMember, listMembers, type MemberWithClass } from "./common";
import {
  buildLedger,
  computeBalance,
  memberStatus,
  nextInstallment,
  overallStatus,
  parseInstallmentsJson,
  type DuesStatus,
  type Installment,
  type LedgerEntry,
  type NextInstallment,
} from "./dues-logic";

/** Member statuses that get billed and appear on the treasurer dashboard. */
export const CURRENT_MEMBER_STATUSES = ["active", "new_member", "abroad"] as const;

/* ------------------------------------------------------------------ */
/* Periods                                                              */
/* ------------------------------------------------------------------ */

export function getActivePeriod(): DuesPeriod | null {
  return db.select().from(duesPeriods).where(eq(duesPeriods.isActive, true)).orderBy(desc(duesPeriods.dueDate), desc(duesPeriods.id)).get() ?? null;
}

export function getPeriod(id: number): DuesPeriod | null {
  return db.select().from(duesPeriods).where(eq(duesPeriods.id, id)).get() ?? null;
}

export type PeriodSummary = DuesPeriod & {
  /** Sum of every charge in the period (credits reduce it). */
  billedCents: number;
  /** Sum of every payment in the period. */
  collectedCents: number;
  /** Members with at least one charge in the period. */
  billedCount: number;
};

/** Every period, newest due date first, with what was billed and collected. */
export function listPeriods(): PeriodSummary[] {
  const rows = db.select().from(duesPeriods).orderBy(desc(duesPeriods.dueDate), desc(duesPeriods.id)).all();
  const billed = db
    .select({ periodId: charges.periodId, total: sql<number>`coalesce(sum(${charges.amountCents}), 0)`, count: sql<number>`count(distinct ${charges.memberId})` })
    .from(charges)
    .groupBy(charges.periodId)
    .all();
  const collected = db
    .select({ periodId: payments.periodId, total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .groupBy(payments.periodId)
    .all();
  return rows.map((p) => {
    const b = billed.find((x) => x.periodId === p.id);
    const c = collected.find((x) => x.periodId === p.id);
    return { ...p, billedCents: b?.total ?? 0, billedCount: b?.count ?? 0, collectedCents: c?.total ?? 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Balances                                                             */
/* ------------------------------------------------------------------ */

export type MemberBalance = {
  chargedCents: number;
  paidCents: number;
  balanceCents: number;
  status: DuesStatus;
  /** Next date money is due: the next approved-plan installment, else the earliest unpaid charge's due date. */
  nextDueDate: string | null;
};

type ApprovedPlan = PaymentPlan & { installments: Installment[] };

function approvedPlansFor(memberIds?: number[]): ApprovedPlan[] {
  const rows = db
    .select()
    .from(paymentPlans)
    .where(and(eq(paymentPlans.status, "approved"), memberIds ? inArray(paymentPlans.memberId, memberIds) : undefined))
    .orderBy(desc(paymentPlans.createdAt), desc(paymentPlans.id))
    .all();
  return rows.map((p) => ({ ...p, installments: parseInstallmentsJson(p.installmentsJson) }));
}

/** Payments that count toward a plan: recorded after the plan was created, in the plan's period. */
export function planPaidCents(plan: PaymentPlan, memberPayments: Payment[]): number {
  return memberPayments
    .filter((p) => (p.periodId ?? null) === (plan.periodId ?? null) && p.createdAt >= plan.createdAt)
    .reduce((t, p) => t + p.amountCents, 0);
}

/** Balance for one scope (a period id, or null for unassigned rows). */
function scopedBalance(memberCharges: Charge[], memberPayments: Payment[], plans: ApprovedPlan[], periodId: number | null, today: string): MemberBalance {
  const b = computeBalance(memberCharges, memberPayments, periodId);
  let earliestUnpaidDue = b.earliestUnpaidDue;
  let nextDueDate = b.earliestUnpaidDue;
  const plan = plans.find((p) => (p.periodId ?? null) === periodId);
  if (plan && b.balanceCents > 0) {
    const next = nextInstallment(plan.installments, planPaidCents(plan, memberPayments), today);
    if (next) {
      earliestUnpaidDue = next.dueDate;
      nextDueDate = next.dueDate;
    }
  }
  const status = memberStatus({ ...b, earliestUnpaidDue }, today);
  return { chargedCents: b.chargedCents, paidCents: b.paidCents, balanceCents: b.balanceCents, status, nextDueDate: b.balanceCents > 0 ? nextDueDate : null };
}

function scopesOf(memberCharges: Charge[], memberPayments: Payment[]): (number | null)[] {
  const ids = new Set<number | null>();
  for (const c of memberCharges) ids.add(c.periodId ?? null);
  for (const p of memberPayments) ids.add(p.periodId ?? null);
  return [...ids];
}

/** Balance across every period (and unassigned rows) for one member. */
function balanceFor(memberCharges: Charge[], memberPayments: Payment[], plans: ApprovedPlan[], periodId: number | null | undefined, today: string): MemberBalance {
  if (periodId !== undefined) return scopedBalance(memberCharges, memberPayments, plans, periodId, today);
  const scopes = scopesOf(memberCharges, memberPayments).map((id) => scopedBalance(memberCharges, memberPayments, plans, id, today));
  const chargedCents = scopes.reduce((t, s) => t + s.chargedCents, 0);
  const paidCents = scopes.reduce((t, s) => t + s.paidCents, 0);
  const nextDueDate = scopes
    .filter((s) => s.balanceCents > 0 && s.nextDueDate)
    .map((s) => s.nextDueDate as string)
    .sort()[0] ?? null;
  return { chargedCents, paidCents, balanceCents: chargedCents - paidCents, status: overallStatus(scopes), nextDueDate };
}

/** `periodId` undefined = everything; a number = that period; null = rows with no period. */
export function getMemberBalance(memberId: number, periodId?: number | null): MemberBalance {
  const memberCharges = db.select().from(charges).where(eq(charges.memberId, memberId)).all();
  const memberPayments = db.select().from(payments).where(eq(payments.memberId, memberId)).all();
  return balanceFor(memberCharges, memberPayments, approvedPlansFor([memberId]), periodId, todayISO());
}

export type BalanceRow = MemberBalance & {
  member: MemberWithClass;
  lastPaymentAt: string | null;
  /** The member has a proposed or approved plan in this scope. */
  hasPlan: boolean;
};

/** Balances for every current member (active, new member, abroad), ordered by last name. */
export function getBalances(periodId?: number | null): BalanceRow[] {
  const today = todayISO();
  const current = listMembers({ activeOnly: true });
  const ids = current.map((m) => m.id);
  if (ids.length === 0) return [];
  const allCharges = db.select().from(charges).where(inArray(charges.memberId, ids)).all();
  const allPayments = db.select().from(payments).where(inArray(payments.memberId, ids)).all();
  const plans = approvedPlansFor(ids);
  const openPlans = db
    .select({ memberId: paymentPlans.memberId, periodId: paymentPlans.periodId })
    .from(paymentPlans)
    .where(and(inArray(paymentPlans.status, ["proposed", "approved"]), inArray(paymentPlans.memberId, ids)))
    .all();
  const chargesBy = groupBy(allCharges, (c) => c.memberId);
  const paymentsBy = groupBy(allPayments, (p) => p.memberId);
  const plansBy = groupBy(plans, (p) => p.memberId);
  return current.map((member) => {
    const mc = chargesBy.get(member.id) ?? [];
    const mp = paymentsBy.get(member.id) ?? [];
    const balance = balanceFor(mc, mp, plansBy.get(member.id) ?? [], periodId, today);
    const scopedPayments = mp.filter((p) => periodId === undefined || (p.periodId ?? null) === periodId);
    const lastPaymentAt = scopedPayments.map((p) => p.paidAt).sort().at(-1) ?? null;
    const hasPlan = openPlans.some((p) => p.memberId === member.id && (periodId === undefined || (p.periodId ?? null) === periodId));
    return { member, ...balance, lastPaymentAt, hasPlan };
  });
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Period stats                                                         */
/* ------------------------------------------------------------------ */

export type PeriodStats = {
  billedCents: number;
  collectedCents: number;
  /** Sum of positive balances of current members. */
  outstandingCents: number;
  memberCount: number;
  billedCount: number;
  paidInFullCount: number;
  partialCount: number;
  unpaidCount: number;
  overdueCount: number;
};

/** Totals for a period (or every period when undefined). Money totals cover every charge and payment; counts cover current members. */
export function getPeriodStats(periodId?: number | null): PeriodStats {
  const chargeFilter = periodId === undefined ? undefined : periodId === null ? sql`${charges.periodId} is null` : eq(charges.periodId, periodId);
  const paymentFilter = periodId === undefined ? undefined : periodId === null ? sql`${payments.periodId} is null` : eq(payments.periodId, periodId);
  const billed = db.select({ total: sql<number>`coalesce(sum(${charges.amountCents}), 0)` }).from(charges).where(chargeFilter).get();
  const collected = db.select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` }).from(payments).where(paymentFilter).get();
  const rows = getBalances(periodId);
  return {
    billedCents: billed?.total ?? 0,
    collectedCents: collected?.total ?? 0,
    outstandingCents: rows.reduce((t, r) => t + Math.max(0, r.balanceCents), 0),
    memberCount: rows.length,
    billedCount: rows.filter((r) => r.status !== "none").length,
    paidInFullCount: rows.filter((r) => r.status === "paid").length,
    partialCount: rows.filter((r) => r.status === "partial").length,
    unpaidCount: rows.filter((r) => r.status === "unpaid").length,
    overdueCount: rows.filter((r) => r.status === "overdue").length,
  };
}

/* ------------------------------------------------------------------ */
/* Ledger and plans                                                     */
/* ------------------------------------------------------------------ */

export type PlanDetail = PaymentPlan & {
  installments: Installment[];
  totalCents: number;
  paidCents: number;
  next: NextInstallment | null;
  period: DuesPeriod | null;
};

function decoratePlan(plan: PaymentPlan, memberPayments: Payment[], periods: DuesPeriod[], today: string): PlanDetail {
  const installments = parseInstallmentsJson(plan.installmentsJson);
  const paidCents = planPaidCents(plan, memberPayments);
  return {
    ...plan,
    installments,
    totalCents: installments.reduce((t, i) => t + i.amountCents, 0),
    paidCents,
    next: nextInstallment(installments, paidCents, today),
    period: periods.find((p) => p.id === plan.periodId) ?? null,
  };
}

export type LedgerRow = LedgerEntry & { periodName: string | null; charge: Charge | null; payment: Payment | null };

export type MemberLedger = {
  member: MemberWithClass;
  entries: LedgerRow[];
  charges: Charge[];
  payments: Payment[];
  plans: PlanDetail[];
  /** Periods the member has activity in, newest first. */
  periods: DuesPeriod[];
  hasUnassigned: boolean;
};

export function getMemberLedger(memberId: number): MemberLedger | null {
  const member = getMember(memberId);
  if (!member) return null;
  const today = todayISO();
  const memberCharges = db.select().from(charges).where(eq(charges.memberId, memberId)).orderBy(asc(charges.createdAt), asc(charges.id)).all();
  const memberPayments = db.select().from(payments).where(eq(payments.memberId, memberId)).orderBy(asc(payments.paidAt), asc(payments.id)).all();
  const planRows = db.select().from(paymentPlans).where(eq(paymentPlans.memberId, memberId)).orderBy(desc(paymentPlans.createdAt), desc(paymentPlans.id)).all();
  const allPeriods = db.select().from(duesPeriods).orderBy(desc(duesPeriods.dueDate), desc(duesPeriods.id)).all();
  const usedPeriodIds = new Set<number>();
  for (const c of memberCharges) if (c.periodId != null) usedPeriodIds.add(c.periodId);
  for (const p of memberPayments) if (p.periodId != null) usedPeriodIds.add(p.periodId);
  for (const p of planRows) if (p.periodId != null) usedPeriodIds.add(p.periodId);
  const entries = buildLedger(memberCharges, memberPayments).map((e) => ({
    ...e,
    periodName: e.periodId == null ? null : (allPeriods.find((p) => p.id === e.periodId)?.name ?? null),
    charge: e.type === "charge" ? (memberCharges.find((c) => c.id === e.id) ?? null) : null,
    payment: e.type === "payment" ? (memberPayments.find((p) => p.id === e.id) ?? null) : null,
  }));
  return {
    member,
    entries,
    charges: memberCharges,
    payments: memberPayments,
    plans: planRows.map((p) => decoratePlan(p, memberPayments, allPeriods, today)),
    periods: allPeriods.filter((p) => usedPeriodIds.has(p.id)),
    hasUnassigned: memberCharges.some((c) => c.periodId == null) || memberPayments.some((p) => p.periodId == null),
  };
}

export type MemberPeriodRow = MemberBalance & { period: DuesPeriod | null };

/** One row per period (plus one for unassigned rows) the member has activity in, newest period first. */
export function getMemberPeriodRows(memberId: number): MemberPeriodRow[] {
  const today = todayISO();
  const memberCharges = db.select().from(charges).where(eq(charges.memberId, memberId)).all();
  const memberPayments = db.select().from(payments).where(eq(payments.memberId, memberId)).all();
  const plans = approvedPlansFor([memberId]);
  const allPeriods = db.select().from(duesPeriods).orderBy(desc(duesPeriods.dueDate), desc(duesPeriods.id)).all();
  const scopes = scopesOf(memberCharges, memberPayments);
  const rows: MemberPeriodRow[] = [];
  for (const period of allPeriods) {
    if (!scopes.includes(period.id)) continue;
    rows.push({ period, ...scopedBalance(memberCharges, memberPayments, plans, period.id, today) });
  }
  if (scopes.includes(null)) rows.push({ period: null, ...scopedBalance(memberCharges, memberPayments, plans, null, today) });
  return rows;
}

export function getCharge(id: number): Charge | null {
  return db.select().from(charges).where(eq(charges.id, id)).get() ?? null;
}

export function getPayment(id: number): Payment | null {
  return db.select().from(payments).where(eq(payments.id, id)).get() ?? null;
}

export function getPlan(id: number): PlanDetail | null {
  const plan = db.select().from(paymentPlans).where(eq(paymentPlans.id, id)).get();
  if (!plan) return null;
  const memberPayments = db.select().from(payments).where(eq(payments.memberId, plan.memberId)).all();
  const allPeriods = db.select().from(duesPeriods).all();
  return decoratePlan(plan, memberPayments, allPeriods, todayISO());
}

export type PlanRow = PlanDetail & { member: MemberWithClass };

/** Every payment plan, open ones first, newest first. */
export function listPlans(): PlanRow[] {
  const today = todayISO();
  const rows = db
    .select({ plan: paymentPlans, member: members, pledgeClass: pledgeClasses })
    .from(paymentPlans)
    .innerJoin(members, eq(members.id, paymentPlans.memberId))
    .leftJoin(pledgeClasses, eq(pledgeClasses.id, members.pledgeClassId))
    .orderBy(desc(paymentPlans.createdAt), desc(paymentPlans.id))
    .all();
  if (rows.length === 0) return [];
  const memberIds = [...new Set(rows.map((r) => r.plan.memberId))];
  const allPayments = db.select().from(payments).where(inArray(payments.memberId, memberIds)).all();
  const allPeriods = db.select().from(duesPeriods).all();
  const paymentsBy = groupBy(allPayments, (p) => p.memberId);
  const order: Record<string, number> = { proposed: 0, approved: 1, completed: 2, defaulted: 3, cancelled: 4 };
  return rows
    .map((r) => ({ ...decoratePlan(r.plan, paymentsBy.get(r.plan.memberId) ?? [], allPeriods, today), member: { ...r.member, pledgeClass: r.pledgeClass } }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

/* ------------------------------------------------------------------ */
/* Billing and late fee previews                                        */
/* ------------------------------------------------------------------ */

export type BillPreview = {
  period: DuesPeriod;
  toBill: { member: MemberWithClass; amountCents: number }[];
  alreadyBilled: MemberWithClass[];
  /** Unbilled members whose computed amount is $0 (for example new members when the new member amount is 0); no charge is created for them. */
  skipped: MemberWithClass[];
  totalCents: number;
};

/** Current members without a dues charge for the period, with the amount each would be charged. */
export function getBillPreview(periodId: number): BillPreview | null {
  const period = getPeriod(periodId);
  if (!period) return null;
  const current = listMembers({ activeOnly: true });
  const billedIds = new Set(
    db
      .select({ memberId: charges.memberId })
      .from(charges)
      .where(and(eq(charges.periodId, periodId), eq(charges.kind, "dues")))
      .all()
      .map((r) => r.memberId),
  );
  const unbilled = current
    .filter((m) => !billedIds.has(m.id))
    .map((member) => ({ member, amountCents: member.status === "new_member" && period.newMemberAmountCents != null ? period.newMemberAmountCents : period.amountCents }));
  const toBill = unbilled.filter((r) => r.amountCents > 0);
  return {
    period,
    toBill,
    alreadyBilled: current.filter((m) => billedIds.has(m.id)),
    skipped: unbilled.filter((r) => r.amountCents <= 0).map((r) => r.member),
    totalCents: toBill.reduce((t, r) => t + r.amountCents, 0),
  };
}

export type LateFeePreview = {
  period: DuesPeriod;
  toCharge: { member: MemberWithClass; balanceCents: number }[];
  alreadyCharged: MemberWithClass[];
  /** Members who still owe money but are not overdue (an approved payment plan whose next installment is not due yet, or only later-dated charges); no fee is charged. */
  notYetDue: { member: MemberWithClass; balanceCents: number; nextDueDate: string | null }[];
  totalCents: number;
  isPastDue: boolean;
};

/**
 * Current members who are overdue for the period (positive balance whose next due date, the next approved-plan installment
 * when there is one, has passed) and have no late fee yet. Uses the same status as the dashboard, so a brother on a plan
 * whose next installment is still ahead is listed as not yet due instead of being charged.
 */
export function getLateFeePreview(periodId: number): LateFeePreview | null {
  const period = getPeriod(periodId);
  if (!period) return null;
  const today = todayISO();
  const feedIds = new Set(
    db
      .select({ memberId: charges.memberId })
      .from(charges)
      .where(and(eq(charges.periodId, periodId), eq(charges.kind, "late_fee")))
      .all()
      .map((r) => r.memberId),
  );
  const owing = getBalances(periodId).filter((r) => r.balanceCents > 0);
  const overdue = owing.filter((r) => r.status === "overdue");
  const toCharge = overdue.filter((r) => !feedIds.has(r.member.id)).map((r) => ({ member: r.member, balanceCents: r.balanceCents }));
  return {
    period,
    toCharge,
    alreadyCharged: owing.filter((r) => feedIds.has(r.member.id)).map((r) => r.member),
    notYetDue: owing
      .filter((r) => r.status !== "overdue" && !feedIds.has(r.member.id))
      .map((r) => ({ member: r.member, balanceCents: r.balanceCents, nextDueDate: r.nextDueDate })),
    totalCents: toCharge.length * period.lateFeeCents,
    isPastDue: today > period.dueDate,
  };
}
