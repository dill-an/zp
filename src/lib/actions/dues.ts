"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { CHARGE_KINDS, PAYMENT_METHODS, charges, duesPeriods, paymentPlans, payments } from "@/db/schema";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { dateAtLocalTime, todayISO } from "@/lib/dates";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { getMember } from "@/lib/queries/common";
import { getBillPreview, getCharge, getLateFeePreview, getMemberBalance, getPayment, getPeriod } from "@/lib/queries/dues";
import { parseInstallments } from "@/lib/queries/dues-logic";

/* ------------------------------------------------------------------ */
/* Schema helpers                                                       */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const id = z.coerce.number({ error: "Missing id." }).int().positive("Missing id.");
const optionalId = z.coerce.number().int().positive().optional();
const dateOnly = z.string({ error: "Enter a date." }).regex(DATE_RE, "Enter a date.");

/** Dollars input ("12.50", "$1,234") to integer cents. */
function dollars(message: string) {
  return z.string({ error: message }).transform((value, ctx) => {
    const cents = parseDollarsToCents(value);
    if (cents == null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return cents;
  });
}

function optionalDollars(message: string) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value == null || value.trim() === "") return null;
      const cents = parseDollarsToCents(value);
      if (cents == null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return cents;
    });
}

const optionalText = z.string().trim().max(2000).optional();

function revalidateDues(memberId?: number | null) {
  revalidatePath("/dues", "layout");
  revalidatePath("/dues");
  if (memberId) revalidatePath(`/dues/members/${memberId}`);
  revalidatePath("/dashboard");
}

/** "YYYY-MM-DD" as an instant at noon house time, so it displays as that date everywhere. */
function dateToInstant(date: string): string {
  return dateAtLocalTime(date, "12:00");
}

function memberLabel(memberId: number): string {
  const m = getMember(memberId);
  return m ? `${displayName(m)} (${m.username})` : `member #${memberId}`;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

const paymentFields = {
  periodId: optionalId,
  amount: dollars("Enter the amount paid in dollars."),
  method: z.enum(PAYMENT_METHODS, { error: "Pick a payment method." }),
  paidAt: dateOnly,
  reference: optionalText,
  notes: optionalText,
};

const recordPaymentSchema = z.object({ memberId: id, ...paymentFields });

export async function recordPayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(recordPaymentSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { memberId, periodId, amount, method, paidAt, reference, notes } = parsed.data;
    if (amount <= 0) return fail("The amount must be more than $0.", { amount: ["Must be more than $0."] });
    const member = getMember(memberId);
    if (!member) return fail("Not found.");
    if (periodId != null && !getPeriod(periodId)) return fail("Not found.");
    const row = db
      .insert(payments)
      .values({ memberId, periodId: periodId ?? null, amountCents: amount, method, paidAt: dateToInstant(paidAt), reference: reference || null, notes: notes || null, recordedById: user.id })
      .returning({ id: payments.id })
      .get();
    logAudit({
      actorId: user.id,
      action: "dues.payment.record",
      entityType: "payment",
      entityId: row.id,
      summary: `${user.username} recorded a ${formatCents(amount)} ${method} payment from ${memberLabel(memberId)}`,
    });
    revalidateDues(memberId);
    return ok(`Recorded ${formatCents(amount)} from ${displayName(member)}.`, row.id);
  });
}

const updatePaymentSchema = z.object({ paymentId: id, ...paymentFields });

export async function updatePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(updatePaymentSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { paymentId, periodId, amount, method, paidAt, reference, notes } = parsed.data;
    if (amount <= 0) return fail("The amount must be more than $0.", { amount: ["Must be more than $0."] });
    const existing = getPayment(paymentId);
    if (!existing) return fail("Not found.");
    if (periodId != null && !getPeriod(periodId)) return fail("Not found.");
    db.update(payments)
      .set({ periodId: periodId ?? null, amountCents: amount, method, paidAt: dateToInstant(paidAt), reference: reference || null, notes: notes || null })
      .where(eq(payments.id, paymentId))
      .run();
    logAudit({
      actorId: user.id,
      action: "dues.payment.update",
      entityType: "payment",
      entityId: paymentId,
      summary: `${user.username} edited a payment from ${memberLabel(existing.memberId)} (${formatCents(existing.amountCents)} -> ${formatCents(amount)})`,
    });
    revalidateDues(existing.memberId);
    return ok("Payment updated.", paymentId);
  });
}

export async function deletePayment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ paymentId: id }), formData);
    if ("result" in parsed) return parsed.result;
    const existing = getPayment(parsed.data.paymentId);
    if (!existing) return fail("Not found.");
    db.delete(payments).where(eq(payments.id, existing.id)).run();
    logAudit({
      actorId: user.id,
      action: "dues.payment.delete",
      entityType: "payment",
      entityId: existing.id,
      summary: `${user.username} deleted a ${formatCents(existing.amountCents)} payment from ${memberLabel(existing.memberId)}`,
    });
    revalidateDues(existing.memberId);
    return ok("Payment deleted.");
  });
}

/* ------------------------------------------------------------------ */
/* Charges                                                              */
/* ------------------------------------------------------------------ */

const chargeFields = {
  periodId: optionalId,
  kind: z.enum(CHARGE_KINDS, { error: "Pick a kind." }),
  description: z.string({ error: "Enter a description." }).trim().min(1, "Enter a description.").max(200),
  amount: dollars("Enter an amount in dollars (negative for a credit)."),
  dueDate: z.string().regex(DATE_RE, "Enter a date.").optional(),
};

const addChargeSchema = z.object({ memberId: id, ...chargeFields });

export async function addCharge(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(addChargeSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { memberId, periodId, kind, description, amount, dueDate } = parsed.data;
    if (amount === 0) return fail("The amount cannot be $0.", { amount: ["Cannot be $0."] });
    const member = getMember(memberId);
    if (!member) return fail("Not found.");
    if (periodId != null && !getPeriod(periodId)) return fail("Not found.");
    const row = db
      .insert(charges)
      .values({ memberId, periodId: periodId ?? null, kind, description, amountCents: amount, dueDate: dueDate ?? null, createdById: user.id })
      .returning({ id: charges.id })
      .get();
    logAudit({
      actorId: user.id,
      action: "dues.charge.add",
      entityType: "charge",
      entityId: row.id,
      summary: `${user.username} added a ${formatCents(amount)} ${kind} charge "${description}" to ${memberLabel(memberId)}`,
    });
    revalidateDues(memberId);
    return ok(amount < 0 ? `Credited ${formatCents(-amount)} to ${displayName(member)}.` : `Charged ${formatCents(amount)} to ${displayName(member)}.`, row.id);
  });
}

const updateChargeSchema = z.object({ chargeId: id, ...chargeFields });

export async function updateCharge(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(updateChargeSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { chargeId, periodId, kind, description, amount, dueDate } = parsed.data;
    if (amount === 0) return fail("The amount cannot be $0.", { amount: ["Cannot be $0."] });
    const existing = getCharge(chargeId);
    if (!existing) return fail("Not found.");
    if (periodId != null && !getPeriod(periodId)) return fail("Not found.");
    db.update(charges)
      .set({ periodId: periodId ?? null, kind, description, amountCents: amount, dueDate: dueDate ?? null })
      .where(eq(charges.id, chargeId))
      .run();
    logAudit({
      actorId: user.id,
      action: "dues.charge.update",
      entityType: "charge",
      entityId: chargeId,
      summary: `${user.username} edited a charge for ${memberLabel(existing.memberId)} (${formatCents(existing.amountCents)} -> ${formatCents(amount)})`,
    });
    revalidateDues(existing.memberId);
    return ok("Charge updated.", chargeId);
  });
}

export async function deleteCharge(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ chargeId: id }), formData);
    if ("result" in parsed) return parsed.result;
    const existing = getCharge(parsed.data.chargeId);
    if (!existing) return fail("Not found.");
    db.delete(charges).where(eq(charges.id, existing.id)).run();
    logAudit({
      actorId: user.id,
      action: "dues.charge.delete",
      entityType: "charge",
      entityId: existing.id,
      summary: `${user.username} deleted a ${formatCents(existing.amountCents)} ${existing.kind} charge "${existing.description}" for ${memberLabel(existing.memberId)}`,
    });
    revalidateDues(existing.memberId);
    return ok("Charge deleted.");
  });
}

/* ------------------------------------------------------------------ */
/* Periods                                                              */
/* ------------------------------------------------------------------ */

const periodFields = {
  name: z.string({ error: "Enter a name." }).trim().min(1, "Enter a name.").max(80),
  amount: dollars("Enter the dues amount in dollars."),
  newMemberAmount: optionalDollars("Enter the new member amount in dollars, or leave it blank."),
  dueDate: dateOnly,
  lateFee: optionalDollars("Enter the late fee in dollars, or leave it blank."),
  isActive: z.string().optional(),
  notes: optionalText,
};

function validatePeriodAmounts(data: { amount: number; newMemberAmount: number | null; lateFee: number | null }): ActionResult | null {
  if (data.amount < 0) return fail("The dues amount cannot be negative.", { amount: ["Cannot be negative."] });
  if (data.newMemberAmount != null && data.newMemberAmount < 0) return fail("The new member amount cannot be negative.", { newMemberAmount: ["Cannot be negative."] });
  if (data.lateFee != null && data.lateFee < 0) return fail("The late fee cannot be negative.", { lateFee: ["Cannot be negative."] });
  return null;
}

export async function createPeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object(periodFields), formData);
    if ("result" in parsed) return parsed.result;
    const invalid = validatePeriodAmounts(parsed.data);
    if (invalid) return invalid;
    const { name, amount, newMemberAmount, dueDate, lateFee, isActive, notes } = parsed.data;
    const active = !!isActive;
    try {
      const row = db.transaction((tx) => {
        if (active) tx.update(duesPeriods).set({ isActive: false }).where(eq(duesPeriods.isActive, true)).run();
        return tx
          .insert(duesPeriods)
          .values({ name, amountCents: amount, newMemberAmountCents: newMemberAmount, dueDate, lateFeeCents: lateFee ?? 0, isActive: active, notes: notes || null })
          .returning({ id: duesPeriods.id })
          .get();
      });
      logAudit({
        actorId: user.id,
        action: "dues.period.create",
        entityType: "dues_period",
        entityId: row.id,
        summary: `${user.username} created dues period "${name}" (${formatCents(amount)}, due ${dueDate}${active ? ", active" : ""})`,
      });
      revalidateDues();
      return ok(`Created ${name}.`, row.id);
    } catch (err) {
      if (isUniqueViolation(err)) return fail("A period with that name already exists.", { name: ["Already exists."] });
      throw err;
    }
  });
}

export async function updatePeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ periodId: id, ...periodFields }), formData);
    if ("result" in parsed) return parsed.result;
    const invalid = validatePeriodAmounts(parsed.data);
    if (invalid) return invalid;
    const { periodId, name, amount, newMemberAmount, dueDate, lateFee, isActive, notes } = parsed.data;
    const existing = getPeriod(periodId);
    if (!existing) return fail("Not found.");
    const active = !!isActive;
    try {
      db.transaction((tx) => {
        if (active) tx.update(duesPeriods).set({ isActive: false }).where(and(eq(duesPeriods.isActive, true), ne(duesPeriods.id, periodId))).run();
        tx.update(duesPeriods)
          .set({ name, amountCents: amount, newMemberAmountCents: newMemberAmount, dueDate, lateFeeCents: lateFee ?? 0, isActive: active, notes: notes || null })
          .where(eq(duesPeriods.id, periodId))
          .run();
      });
    } catch (err) {
      if (isUniqueViolation(err)) return fail("A period with that name already exists.", { name: ["Already exists."] });
      throw err;
    }
    logAudit({
      actorId: user.id,
      action: "dues.period.update",
      entityType: "dues_period",
      entityId: periodId,
      summary: `${user.username} updated dues period "${name}" (${formatCents(amount)}, due ${dueDate}, ${active ? "active" : "inactive"})`,
    });
    revalidateDues();
    return ok(`Saved ${name}.`, periodId);
  });
}

/* ------------------------------------------------------------------ */
/* Billing runs and late fees                                           */
/* ------------------------------------------------------------------ */

export async function billPeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ periodId: id }), formData);
    if ("result" in parsed) return parsed.result;
    const preview = getBillPreview(parsed.data.periodId);
    if (!preview) return fail("Not found.");
    const { period, toBill } = preview;
    if (period.amountCents === 0) return fail(`${period.name} has a dues amount of $0. Set the amount under Periods before billing.`);
    if (toBill.length === 0) return fail("Everyone is already billed for this period.");
    const description = `${period.name} dues`;
    db.transaction((tx) => {
      for (const { member, amountCents } of toBill) {
        tx.insert(charges)
          .values({ memberId: member.id, periodId: period.id, kind: "dues", description, amountCents, dueDate: period.dueDate, createdById: user.id })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: "dues.bill",
      entityType: "dues_period",
      entityId: period.id,
      summary: `${user.username} billed ${toBill.length} members ${formatCents(preview.totalCents)} for ${period.name}`,
    });
    revalidateDues();
    redirect(`/dues?period=${period.id}&billed=${toBill.length}&total=${preview.totalCents}`);
  });
}

export async function applyLateFees(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ periodId: id }), formData);
    if ("result" in parsed) return parsed.result;
    const preview = getLateFeePreview(parsed.data.periodId);
    if (!preview) return fail("Not found.");
    const { period, toCharge, isPastDue } = preview;
    if (period.lateFeeCents <= 0) return fail(`${period.name} has no late fee set. Set one under Periods first.`);
    if (!isPastDue) return fail(`${period.name} is not past due yet (due ${period.dueDate}).`);
    if (toCharge.length === 0) return fail("Nobody needs a late fee: everyone who owes money already has one.");
    const today = todayISO();
    db.transaction((tx) => {
      for (const { member } of toCharge) {
        tx.insert(charges)
          .values({ memberId: member.id, periodId: period.id, kind: "late_fee", description: `${period.name} late fee`, amountCents: period.lateFeeCents, dueDate: today, createdById: user.id })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: "dues.late_fees",
      entityType: "dues_period",
      entityId: period.id,
      summary: `${user.username} applied ${formatCents(period.lateFeeCents)} late fees to ${toCharge.length} members for ${period.name}`,
    });
    revalidateDues();
    redirect(`/dues?period=${period.id}&status=overdue&latefees=${toCharge.length}`);
  });
}

/* ------------------------------------------------------------------ */
/* Payment plans                                                        */
/* ------------------------------------------------------------------ */

const PLAN_ROWS = 6;

const planSchema = z.object({
  memberId: id,
  periodId: optionalId,
  notes: optionalText,
  ...Object.fromEntries(
    Array.from({ length: PLAN_ROWS }, (_, i) => [
      [`due_${i + 1}`, z.string().optional()],
      [`amount_${i + 1}`, z.string().optional()],
    ]).flat(),
  ),
});

export async function createPaymentPlan(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(planSchema, formData);
    if ("result" in parsed) return parsed.result;
    const data = parsed.data as Record<string, string | number | undefined> & { memberId: number; periodId?: number; notes?: string };
    const member = getMember(data.memberId);
    if (!member) return fail("Not found.");
    const periodId = data.periodId ?? null;
    const period = periodId != null ? getPeriod(periodId) : null;
    if (periodId != null && !period) return fail("Not found.");
    const balance = getMemberBalance(member.id, periodId);
    if (balance.balanceCents <= 0) return fail(`${displayName(member)} has nothing outstanding${period ? ` for ${period.name}` : ""}.`);
    const openPlans = db
      .select()
      .from(paymentPlans)
      .where(eq(paymentPlans.memberId, member.id))
      .all()
      .filter((p) => (p.periodId ?? null) === periodId && (p.status === "proposed" || p.status === "approved"));
    if (openPlans.length > 0) return fail(`${displayName(member)} already has an open plan${period ? ` for ${period.name}` : ""}. Cancel it first.`);
    const rows = Array.from({ length: PLAN_ROWS }, (_, i) => ({
      dueDate: (data[`due_${i + 1}`] as string | undefined) ?? "",
      amount: (data[`amount_${i + 1}`] as string | undefined) ?? "",
    }));
    const installments = parseInstallments(rows, { totalCents: balance.balanceCents });
    if (!installments.ok) return fail(installments.error);
    const row = db
      .insert(paymentPlans)
      .values({ memberId: member.id, periodId, installmentsJson: JSON.stringify(installments.installments), status: "proposed", notes: data.notes || null })
      .returning({ id: paymentPlans.id })
      .get();
    logAudit({
      actorId: user.id,
      action: "dues.plan.create",
      entityType: "payment_plan",
      entityId: row.id,
      summary: `${user.username} proposed a ${installments.installments.length}-installment plan (${formatCents(balance.balanceCents)}) for ${memberLabel(member.id)}${period ? ` for ${period.name}` : ""}`,
    });
    revalidateDues(member.id);
    return ok(`Plan proposed for ${displayName(member)}.`, row.id);
  });
}

const PLAN_TRANSITIONS = ["approved", "completed", "defaulted", "cancelled"] as const;
const TERMINAL = new Set(["completed", "defaulted", "cancelled"]);

export async function setPlanStatus(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("dues.manage");
    const parsed = parseForm(z.object({ planId: id, status: z.enum(PLAN_TRANSITIONS, { error: "Pick a status." }) }), formData);
    if ("result" in parsed) return parsed.result;
    const { planId, status } = parsed.data;
    const plan = db.select().from(paymentPlans).where(eq(paymentPlans.id, planId)).get();
    if (!plan) return fail("Not found.");
    if (TERMINAL.has(plan.status)) return fail(`This plan is already ${plan.status}.`);
    if (status === "approved" && plan.status !== "proposed") return fail("Only a proposed plan can be approved.");
    if ((status === "completed" || status === "defaulted") && plan.status !== "approved") return fail("Only an approved plan can be marked completed or defaulted.");
    db.update(paymentPlans)
      .set({ status, approvedById: status === "approved" ? user.id : plan.approvedById })
      .where(eq(paymentPlans.id, planId))
      .run();
    logAudit({
      actorId: user.id,
      action: "dues.plan.status",
      entityType: "payment_plan",
      entityId: planId,
      summary: `${user.username} marked the payment plan for ${memberLabel(plan.memberId)} ${status}`,
    });
    revalidateDues(plan.memberId);
    return ok(`Plan ${status}.`, planId);
  });
}
