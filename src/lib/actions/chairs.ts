"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { CHAIR_CATEGORIES, chairHolders, chairs, members } from "@/db/schema";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addDaysISO, todayISO } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { chairSlugTaken, getChair, getChairHolder } from "@/lib/queries/chairs";
import { countActiveTerms } from "@/lib/queries/members";
import {
  chairSlugFromName,
  formatResponsibilities,
  isValidChairSlug,
  parseResponsibilities,
  roleAfterChairAssign,
  roleAfterTermEnd,
} from "@/lib/queries/members-logic";

const checkbox = z
  .string()
  .optional()
  .transform((v) => v !== undefined && v !== "false" && v !== "0");

const chairFields = {
  name: z.string().trim().min(2, "Enter a name.").max(60),
  category: z.enum(CHAIR_CATEGORIES),
  isExec: checkbox,
  description: z.string().trim().max(1000, "Keep the description under 1000 characters.").optional(),
  responsibilities: z.string().max(4000, "Keep responsibilities under 4000 characters.").optional(),
  sortOrder: z.coerce.number().int("Whole numbers only.").min(-1000).max(1000).optional(),
  isActive: checkbox,
};
const createChairSchema = z.object({ ...chairFields, slug: z.string().trim().toLowerCase().max(60).optional() });
const updateChairSchema = z.object({ ...chairFields, id: z.coerce.number().int().positive() });

function values(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

function revalidateChair(slug: string) {
  revalidatePath("/chairs");
  revalidatePath(`/chairs/${slug}`);
  revalidatePath(`/chairs/${slug}/edit`);
}

/* ------------------------------------------------------------------ */
/* Chairs                                                              */
/* ------------------------------------------------------------------ */

export async function createChair(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("chairs.manage");
    const parsed = parseForm(createChairSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const slug = d.slug ? chairSlugFromName(d.slug) : chairSlugFromName(d.name);
    if (!isValidChairSlug(slug)) {
      const msg = "Slugs are 2 to 60 characters: lowercase letters, numbers and underscores.";
      return fail(msg, { slug: [msg] }, values(formData));
    }
    if (chairSlugTaken(slug)) return fail(`The slug "${slug}" is already used by another chair.`, { slug: ["Already used."] }, values(formData));
    const row = db
      .insert(chairs)
      .values({
        slug,
        name: d.name,
        category: d.category,
        isExec: d.isExec,
        description: d.description || null,
        responsibilities: formatResponsibilities(parseResponsibilities(d.responsibilities)),
        sortOrder: d.sortOrder ?? 0,
        isActive: d.isActive,
      })
      .returning({ id: chairs.id })
      .get();
    logAudit({ actorId: actor.id, action: "chair.create", entityType: "chair", entityId: row.id, summary: `${actor.username} added chair ${d.name} (${slug})` });
    revalidateChair(slug);
    redirect(`/chairs/${slug}?ok=${encodeURIComponent("Chair created.")}`);
  });
}

export async function updateChair(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("chairs.manage");
    const parsed = parseForm(updateChairSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const existing = getChair(d.id);
    if (!existing) return fail("Not found.");
    db.update(chairs)
      .set({
        name: d.name,
        category: d.category,
        isExec: d.isExec,
        description: d.description || null,
        responsibilities: formatResponsibilities(parseResponsibilities(d.responsibilities)),
        sortOrder: d.sortOrder ?? existing.sortOrder,
        isActive: d.isActive,
      })
      .where(eq(chairs.id, d.id))
      .run();
    const changes: string[] = [];
    if (existing.name !== d.name) changes.push(`renamed to ${d.name}`);
    if (existing.isActive !== d.isActive) changes.push(d.isActive ? "activated" : "deactivated");
    if (existing.category !== d.category) changes.push(`category ${d.category}`);
    logAudit({
      actorId: actor.id,
      action: "chair.update",
      entityType: "chair",
      entityId: d.id,
      summary: `${actor.username} edited chair ${existing.name}${changes.length ? ` (${changes.join(", ")})` : ""}`,
    });
    revalidateChair(existing.slug);
    revalidatePath("/members");
    redirect(`/chairs/${existing.slug}?ok=${encodeURIComponent("Chair saved.")}`);
  });
}

/* ------------------------------------------------------------------ */
/* Holders                                                             */
/* ------------------------------------------------------------------ */

const assignSchema = z.object({
  chairId: z.coerce.number().int().positive(),
  memberId: z.coerce.number({ message: "Pick a brother." }).int().positive("Pick a brother."),
  termStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  keepCurrent: checkbox,
  title: z.string().trim().max(40).optional(),
});

/** Set a member's role after their chair terms changed (never touches admins). */
function syncRoleAfterTermEnd(actorId: number, actorUsername: string, memberId: number) {
  const m = db.select({ id: members.id, role: members.role, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName }).from(members).where(eq(members.id, memberId)).get();
  if (!m) return;
  const next = roleAfterTermEnd(m.role, countActiveTerms(memberId));
  if (next !== m.role) {
    db.update(members).set({ role: next, updatedAt: new Date().toISOString() }).where(eq(members.id, memberId)).run();
    logAudit({ actorId, action: "member.role", entityType: "member", entityId: memberId, summary: `${actorUsername}: ${displayName(m)} is no longer an officer (last chair term ended)` });
  }
}

export async function assignChairHolder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("chairs.manage");
    const parsed = parseForm(assignSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const chair = getChair(d.chairId);
    if (!chair) return fail("Not found.");
    if (!chair.isActive) return fail(`${chair.name} is inactive. Activate the chair before assigning a holder.`);
    const member = db.select().from(members).where(eq(members.id, d.memberId)).get();
    if (!member) return fail("That brother does not exist.", { memberId: ["Not found."] }, values(formData));
    if (member.status === "inactive" || member.status === "alumni") {
      return fail(`${displayName(member)} is ${member.status}; reactivate them first.`, { memberId: ["Not active."] }, values(formData));
    }
    const current = db
      .select({ holder: chairHolders, member: members })
      .from(chairHolders)
      .innerJoin(members, eq(members.id, chairHolders.memberId))
      .where(and(eq(chairHolders.chairId, chair.id), isNull(chairHolders.termEnd)))
      .all();
    if (current.some((c) => c.holder.memberId === member.id)) {
      return fail(`${displayName(member)} already holds ${chair.name}.`, { memberId: ["Already a holder."] }, values(formData));
    }

    const ended: string[] = [];
    if (!d.keepCurrent) {
      const dayBefore = addDaysISO(d.termStart, -1);
      for (const c of current) {
        const termEnd = dayBefore < c.holder.termStart ? c.holder.termStart : dayBefore;
        db.update(chairHolders).set({ termEnd }).where(eq(chairHolders.id, c.holder.id)).run();
        ended.push(displayName(c.member));
        logAudit({
          actorId: actor.id,
          action: "chair_holder.end",
          entityType: "chair_holder",
          entityId: c.holder.id,
          summary: `${actor.username} ended ${displayName(c.member)}'s term as ${chair.name} on ${termEnd} (replaced)`,
        });
        syncRoleAfterTermEnd(actor.id, actor.username, c.holder.memberId);
      }
    }

    const row = db
      .insert(chairHolders)
      .values({ chairId: chair.id, memberId: member.id, termStart: d.termStart, termEnd: null, title: d.title || null })
      .returning({ id: chairHolders.id })
      .get();

    const nextRole = roleAfterChairAssign(member.role);
    if (nextRole !== member.role) {
      db.update(members).set({ role: nextRole, updatedAt: new Date().toISOString() }).where(eq(members.id, member.id)).run();
      logAudit({ actorId: actor.id, action: "member.role", entityType: "member", entityId: member.id, summary: `${actor.username}: ${displayName(member)} is now an officer (${chair.name})` });
    }
    logAudit({
      actorId: actor.id,
      action: "chair_holder.assign",
      entityType: "chair_holder",
      entityId: row.id,
      summary: `${actor.username} assigned ${displayName(member)} as ${chair.name} from ${d.termStart}${d.keepCurrent && current.length ? " (co-chair)" : ""}${ended.length ? `, replacing ${ended.join(", ")}` : ""}`,
    });

    revalidateChair(chair.slug);
    revalidatePath("/members");
    revalidatePath(`/members/${member.id}`);
    for (const c of current) revalidatePath(`/members/${c.holder.memberId}`);
    return ok(`${displayName(member)} is now ${chair.name}.`, row.id);
  });
}

export async function endChairTerm(holderId: number, termEnd?: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("chairs.manage");
    const holder = getChairHolder(holderId);
    if (!holder) return fail("Not found.");
    if (holder.termEnd) return fail("That term has already ended.");
    const chair = getChair(holder.chairId);
    const member = db.select().from(members).where(eq(members.id, holder.memberId)).get();
    if (!chair || !member) return fail("Not found.");
    const requested = termEnd && /^\d{4}-\d{2}-\d{2}$/.test(termEnd) ? termEnd : todayISO();
    const end = requested < holder.termStart ? holder.termStart : requested;
    db.update(chairHolders).set({ termEnd: end }).where(and(eq(chairHolders.id, holderId), ne(chairHolders.id, -1))).run();
    logAudit({
      actorId: actor.id,
      action: "chair_holder.end",
      entityType: "chair_holder",
      entityId: holderId,
      summary: `${actor.username} ended ${displayName(member)}'s term as ${chair.name} on ${end}`,
    });
    syncRoleAfterTermEnd(actor.id, actor.username, member.id);
    revalidateChair(chair.slug);
    revalidatePath("/members");
    revalidatePath(`/members/${member.id}`);
    return ok(`Ended ${displayName(member)}'s term as ${chair.name}.`);
  });
}

/** Form wrapper for the End term ConfirmButton: hidden inputs `holderId` and `slug`. */
export async function endChairTermForm(formData: FormData): Promise<void> {
  const holderId = Number(formData.get("holderId"));
  const slug = String(formData.get("slug") ?? "");
  const result = await endChairTerm(holderId);
  const target = slug ? `/chairs/${encodeURIComponent(slug)}` : "/chairs";
  redirect(`${target}?${result.ok ? `ok=${encodeURIComponent(result.message ?? "Saved.")}` : `error=${encodeURIComponent(result.error)}`}`);
}
