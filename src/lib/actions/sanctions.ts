"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { charges, members, sanctions, SANCTION_SOURCES, type Sanction } from "@/db/schema";
import { fail, formValues, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isoToLocalInput, localInputToISO, nowISO } from "@/lib/dates";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { can } from "@/lib/permissions";
import { setSetting } from "@/lib/settings";
import { appendAppealNote, nextStatus, SANCTIONS_POLICY_KEY, type SanctionAction } from "@/lib/queries/sanctions-logic";

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

const idList = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null ? [] : [v]),
  z.array(z.coerce.number().int().positive()).min(1, "Pick at least one brother."),
);

const dollars = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return 0;
    const cents = parseDollarsToCents(v);
    if (cents == null || cents < 0) {
      ctx.addIssue({ code: "custom", message: "Enter a dollar amount like 25 or 12.50." });
      return z.NEVER;
    }
    return cents;
  });

const localDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const iso = localInputToISO(v);
    if (!iso || Number.isNaN(Date.parse(iso))) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return z.NEVER;
    }
    return iso;
  });

const sanctionFields = {
  reason: z.string().trim().min(1, "Give a reason.").max(300, "Keep the reason under 300 characters."),
  jobDescription: z.string().trim().max(500).optional(),
  hours: z.coerce.number().int("Whole hours only.").min(0).max(200, "That is too many hours.").optional(),
  fineDollars: dollars,
  source: z.enum(SANCTION_SOURCES).default("manual"),
  dueAt: localDateTime,
  notes: z.string().trim().max(2000).optional(),
};

const createSchema = z.object({
  ...sanctionFields,
  memberId: z.coerce.number().int().positive().optional(),
  memberIds: idList.optional(),
  multi: z.string().optional(),
});

const editSchema = z.object(sanctionFields);

const appealSchema = z.object({
  reason: z.string().trim().min(3, "Say why you are appealing.").max(1000),
});

const policySchema = z.object({
  policy: z.string().trim().max(20000).optional(),
});

function revalidateSanction(id?: number, memberId?: number) {
  revalidatePath("/sanctions");
  revalidatePath("/dashboard");
  if (id) {
    revalidatePath(`/sanctions/${id}`);
    revalidatePath(`/sanctions/${id}/edit`);
  }
  if (memberId) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath(`/dues/members/${memberId}`);
  }
}

function loadSanction(id: number): Sanction | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.select().from(sanctions).where(eq(sanctions.id, id)).get() ?? null;
}

function memberLabel(memberId: number): string {
  const m = db.select({ firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName }).from(members).where(eq(members.id, memberId)).get();
  return m ? displayName(m) : `member #${memberId}`;
}

/** Calendar date (house timezone) of an instant, for a charge's dueDate. */
function dueDateFor(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const local = isoToLocalInput(dueAt);
  return local ? local.slice(0, 10) : null;
}

/** Create, update or delete the single `fine` charge that mirrors `sanction.fineCents`. */
function syncFineCharge(sanction: Sanction, actorId: number) {
  const existing = db
    .select()
    .from(charges)
    .where(and(eq(charges.sanctionId, sanction.id), eq(charges.kind, "fine")))
    .all();
  const fine = sanction.fineCents ?? 0;
  const description = `Fine: ${sanction.reason}`;
  const dueDate = dueDateFor(sanction.dueAt);
  if (fine > 0) {
    if (existing.length === 0) {
      db.insert(charges)
        .values({ memberId: sanction.memberId, kind: "fine", description, amountCents: fine, dueDate, sanctionId: sanction.id, createdById: actorId })
        .run();
    } else {
      const [keep, ...extra] = existing;
      db.update(charges).set({ description, amountCents: fine, dueDate, memberId: sanction.memberId }).where(eq(charges.id, keep.id)).run();
      if (extra.length) db.delete(charges).where(inArray(charges.id, extra.map((c) => c.id))).run();
    }
  } else if (existing.length) {
    db.delete(charges).where(inArray(charges.id, existing.map((c) => c.id))).run();
  }
  // A waived sanction keeps its fine and an offsetting credit; keep the credit in step with the fine.
  const credits = db
    .select()
    .from(charges)
    .where(and(eq(charges.sanctionId, sanction.id), eq(charges.kind, "credit")))
    .all();
  if (sanction.status === "waived" && fine > 0) {
    if (credits.length === 0) {
      db.insert(charges)
        .values({ memberId: sanction.memberId, kind: "credit", description: `Waived fine: ${sanction.reason}`, amountCents: -fine, sanctionId: sanction.id, createdById: actorId })
        .run();
    } else {
      const [keep, ...extra] = credits;
      db.update(charges).set({ amountCents: -fine, description: `Waived fine: ${sanction.reason}`, memberId: sanction.memberId }).where(eq(charges.id, keep.id)).run();
      if (extra.length) db.delete(charges).where(inArray(charges.id, extra.map((c) => c.id))).run();
    }
  } else if (credits.length) {
    db.delete(charges).where(inArray(charges.id, credits.map((c) => c.id))).run();
  }
}

/* ------------------------------------------------------------------ */
/* Issue / edit / delete (sanctions.manage)                            */
/* ------------------------------------------------------------------ */

export async function createSanction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("sanctions.manage");
    const parsed = parseForm(createSchema, formData);
    if ("result" in parsed) return parsed.result;
    const data = parsed.data;
    const multi = data.multi === "1" || data.multi === "on";
    const targetIds = multi ? (data.memberIds ?? []) : data.memberId ? [data.memberId] : [];
    if (targetIds.length === 0) return fail(multi ? "Pick at least one brother." : "Pick a brother.", { memberId: ["Pick a brother."] }, formValues(formData));
    const unique = [...new Set(targetIds)];
    const found = db.select({ id: members.id }).from(members).where(inArray(members.id, unique)).all();
    if (found.length !== unique.length) return fail("One of those brothers does not exist.", undefined, formValues(formData));

    const issuedAt = nowISO();
    const created: number[] = [];
    for (const memberId of unique) {
      const row = db
        .insert(sanctions)
        .values({
          memberId,
          issuedById: user.id,
          reason: data.reason,
          jobDescription: data.jobDescription || null,
          hours: data.hours ?? null,
          fineCents: data.fineDollars > 0 ? data.fineDollars : null,
          source: data.source,
          issuedAt,
          dueAt: data.dueAt,
          status: "open",
          notes: data.notes || null,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        })
        .returning()
        .get();
      syncFineCharge(row, user.id);
      logAudit({
        actorId: user.id,
        action: "sanction.issue",
        entityType: "sanction",
        entityId: row.id,
        summary: `${displayName(user)} issued a sanction to ${memberLabel(memberId)}: ${data.reason}${data.fineDollars > 0 ? ` (fine ${formatCents(data.fineDollars)})` : ""}`,
      });
      created.push(row.id);
      revalidateSanction(row.id, memberId);
    }
    if (created.length === 1) redirect(`/sanctions/${created[0]}`);
    redirect(`/sanctions?issued=${created.length}`);
  });
}

export async function updateSanction(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("sanctions.manage");
    const existing = loadSanction(id);
    if (!existing) return fail("Not found.");
    const parsed = parseForm(editSchema, formData);
    if ("result" in parsed) return parsed.result;
    const data = parsed.data;
    const updated = db
      .update(sanctions)
      .set({
        reason: data.reason,
        jobDescription: data.jobDescription || null,
        hours: data.hours ?? null,
        fineCents: data.fineDollars > 0 ? data.fineDollars : null,
        source: data.source,
        dueAt: data.dueAt,
        notes: data.notes || null,
        updatedAt: nowISO(),
      })
      .where(eq(sanctions.id, id))
      .returning()
      .get();
    syncFineCharge(updated, user.id);
    const changes: string[] = [];
    if (existing.reason !== updated.reason) changes.push("reason");
    if ((existing.jobDescription ?? null) !== (updated.jobDescription ?? null)) changes.push("job");
    if ((existing.hours ?? null) !== (updated.hours ?? null)) changes.push("hours");
    if ((existing.fineCents ?? null) !== (updated.fineCents ?? null)) changes.push(`fine ${formatCents(existing.fineCents)} -> ${formatCents(updated.fineCents)}`);
    if (existing.source !== updated.source) changes.push("source");
    if ((existing.dueAt ?? null) !== (updated.dueAt ?? null)) changes.push("due date");
    if ((existing.notes ?? null) !== (updated.notes ?? null)) changes.push("notes");
    logAudit({
      actorId: user.id,
      action: "sanction.edit",
      entityType: "sanction",
      entityId: id,
      summary: `${displayName(user)} edited sanction for ${memberLabel(updated.memberId)}${changes.length ? ` (${changes.join(", ")})` : ""}`,
    });
    revalidateSanction(id, updated.memberId);
    redirect(`/sanctions/${id}`);
  });
}

export async function deleteSanction(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("sanctions.manage");
    const existing = loadSanction(id);
    if (!existing) return fail("Not found.");
    db.delete(charges).where(eq(charges.sanctionId, id)).run();
    db.delete(sanctions).where(eq(sanctions.id, id)).run();
    logAudit({
      actorId: user.id,
      action: "sanction.delete",
      entityType: "sanction",
      entityId: id,
      summary: `${displayName(user)} deleted sanction for ${memberLabel(existing.memberId)}: ${existing.reason}`,
    });
    revalidateSanction(id, existing.memberId);
    redirect("/sanctions");
  });
}

/* ------------------------------------------------------------------ */
/* Status changes                                                      */
/* ------------------------------------------------------------------ */

type StatusAction = Exclude<SanctionAction, "edit" | "delete">;
const OWNER_ACTIONS: readonly StatusAction[] = ["start", "complete", "appeal"];

const ACTION_LABEL: Record<StatusAction, string> = {
  start: "started",
  complete: "marked completed",
  appeal: "appealed",
  verify: "verified",
  waive: "waived",
  reopen: "reopened",
};

/** Shared transition: checks role, legal move, updates columns, writes audit. Returns the new row or an error. */
async function transition(id: number, action: StatusAction, extra: { note?: string } = {}): Promise<{ row: Sanction } | { result: ActionResult }> {
  const user = await requireUserForAction();
  const existing = loadSanction(id);
  if (!existing) return { result: fail("Not found.") };
  const isManager = can(user, "sanctions.manage");
  const isOwner = existing.memberId === user.id;
  if (OWNER_ACTIONS.includes(action) ? !(isOwner || isManager) : !isManager) {
    return { result: fail("You can't do that to this sanction.") };
  }
  const next = nextStatus(existing.status, action);
  if (!next) return { result: fail(`This sanction is ${existing.status.replace(/_/g, " ")}; it can't be ${ACTION_LABEL[action]} now.`) };

  const at = nowISO();
  const set: Partial<Sanction> = { status: next, updatedAt: at };
  if (action === "complete") set.completedAt = at;
  if (action === "verify") {
    set.verifiedById = user.id;
    set.verifiedAt = at;
    if (!existing.completedAt) set.completedAt = at;
  }
  if (action === "reopen") {
    set.completedAt = null;
    set.verifiedById = null;
    set.verifiedAt = null;
  }
  if (action === "appeal" && extra.note) set.notes = appendAppealNote(existing.notes, extra.note, at);
  const row = db.update(sanctions).set(set).where(eq(sanctions.id, id)).returning().get();

  // Fines: waiving adds an offsetting credit; reopening a waived sanction removes it again.
  if (action === "waive" || (action === "reopen" && existing.status === "waived")) syncFineCharge(row, user.id);

  const who = isOwner ? "their own" : `${memberLabel(existing.memberId)}'s`;
  logAudit({
    actorId: user.id,
    action: `sanction.${action}`,
    entityType: "sanction",
    entityId: id,
    summary: `${displayName(user)} ${ACTION_LABEL[action]} ${who} sanction: ${existing.reason}${extra.note ? ` (${extra.note.trim()})` : ""}`,
  });
  revalidateSanction(id, existing.memberId);
  return { row };
}

async function simpleTransition(id: number, action: StatusAction, message: string): Promise<ActionResult> {
  return runAction(async () => {
    const r = await transition(id, action);
    return "result" in r ? r.result : ok(message, id);
  });
}

export async function startSanction(id: number): Promise<ActionResult> {
  return simpleTransition(id, "start", "Marked in progress.");
}

export async function completeSanction(id: number): Promise<ActionResult> {
  return simpleTransition(id, "complete", "Marked completed. A standards officer will verify it.");
}

export async function verifySanction(id: number): Promise<ActionResult> {
  return simpleTransition(id, "verify", "Verified.");
}

export async function waiveSanction(id: number): Promise<ActionResult> {
  return simpleTransition(id, "waive", "Waived. Any fine was credited back.");
}

export async function reopenSanction(id: number): Promise<ActionResult> {
  return simpleTransition(id, "reopen", "Reopened.");
}

export async function appealSanction(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = parseForm(appealSchema, formData);
    if ("result" in parsed) return parsed.result;
    const r = await transition(id, "appeal", { note: parsed.data.reason });
    return "result" in r ? r.result : ok("Appeal sent to standards.", id);
  });
}

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

export async function savePolicy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("sanctions.manage");
    const parsed = parseForm(policySchema, formData);
    if ("result" in parsed) return parsed.result;
    const text = parsed.data.policy ?? "";
    setSetting(SANCTIONS_POLICY_KEY, text);
    logAudit({
      actorId: user.id,
      action: "sanctions.policy.edit",
      entityType: "setting",
      entityId: SANCTIONS_POLICY_KEY,
      summary: `${displayName(user)} updated the standards policy (${text.length} characters)`,
    });
    revalidatePath("/sanctions/policy");
    return ok("Policy saved.");
  });
}
