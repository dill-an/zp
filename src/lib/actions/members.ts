"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { LABOR_GROUPS, MEMBER_ROLES, MEMBER_STATUSES, members, pledgeClasses, type Member } from "@/db/schema";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { destroyAllSessionsFor } from "@/lib/session";
import { displayName } from "@/lib/names";
import { resetMemberPassword } from "@/lib/actions/auth";
import { getPledgeClass, listUsernames, usernameTaken } from "@/lib/queries/members";
import { isValidUsername, normalizeUsername, suggestUsername } from "@/lib/queries/members-logic";

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const checkbox = z
  .string()
  .optional()
  .transform((v) => v !== undefined && v !== "false" && v !== "0");

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`).optional();

/** Fields every member may edit on their own profile. */
const selfFields = {
  preferredName: optionalText(60),
  email: z.email("Enter a valid email address.").optional(),
  phone: optionalText(40),
  room: optionalText(20),
  livesInHouse: checkbox,
  major: optionalText(80),
  gradYear: z.coerce.number().int("Enter a year.").min(1950, "Enter a real year.").max(2100, "Enter a real year.").optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.").optional(),
  emergencyContact: optionalText(300),
  dietaryNotes: optionalText(500),
};

/** Fields only `members.manage` may edit. */
const manageFields = {
  firstName: z.string().trim().min(1, "Enter a first name.").max(60),
  lastName: z.string().trim().min(1, "Enter a last name.").max(60),
  username: z.string().trim().max(40).optional(),
  pledgeClassId: z.coerce.number().int().positive().optional(),
  status: z.enum(MEMBER_STATUSES),
  laborGroup: z.enum(LABOR_GROUPS),
  role: z.enum(MEMBER_ROLES).optional(),
  notes: optionalText(2000),
};

const selfSchema = z.object(selfFields);
const manageSchema = z.object({ ...selfFields, ...manageFields });
const createSchema = z.object({
  ...selfFields,
  ...manageFields,
  temporaryPassword: z.string().min(1, "Enter a temporary password."),
});

type SelfData = z.infer<typeof selfSchema>;
type ManageData = z.infer<typeof manageSchema>;

function selfValues(d: SelfData) {
  return {
    email: d.email ?? null,
    phone: d.phone ?? null,
    room: d.room ?? null,
    livesInHouse: d.livesInHouse,
    major: d.major ?? null,
    gradYear: d.gradYear ?? null,
    birthday: d.birthday ?? null,
    emergencyContact: d.emergencyContact ?? null,
    dietaryNotes: d.dietaryNotes ?? null,
  };
}

function resolvePledgeClass(id: number | undefined): { ok: true; id: number | null } | { ok: false; error: string } {
  if (id == null) return { ok: true, id: null };
  if (!getPledgeClass(id)) return { ok: false, error: "That pledge class does not exist." };
  return { ok: true, id };
}

/** Which top-level fields changed, for the audit summary. */
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => (before[k] ?? null) !== (after[k] ?? null));
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createMember(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("members.manage");
    const parsed = parseForm(createSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;

    const weak = validatePasswordStrength(d.temporaryPassword);
    if (weak) return fail(weak, { temporaryPassword: [weak] }, valuesOf(formData));

    let username = d.username ? normalizeUsername(d.username) : "";
    if (!username) username = suggestUsername(d.firstName, d.lastName, listUsernames());
    if (!isValidUsername(username)) {
      const msg = "Usernames are 3 to 40 characters: lowercase letters, numbers, dots and dashes.";
      return fail(msg, { username: [msg] }, valuesOf(formData));
    }
    if (usernameTaken(username)) {
      const suggestion = suggestUsername(d.firstName, d.lastName, listUsernames());
      const msg = `That username is taken. Try ${suggestion}.`;
      return fail(msg, { username: [msg] }, valuesOf(formData));
    }

    const role = d.role ?? "member";
    if (role === "admin" && actor.role !== "admin") return fail("Only an admin can create another admin.", { role: ["Only admins can grant admin."] }, valuesOf(formData));

    const pc = resolvePledgeClass(d.pledgeClassId);
    if (!pc.ok) return fail(pc.error, { pledgeClassId: [pc.error] }, valuesOf(formData));

    const row = db
      .insert(members)
      .values({
        firstName: d.firstName,
        lastName: d.lastName,
        preferredName: d.preferredName || d.firstName,
        username,
        passwordHash: await hashPassword(d.temporaryPassword),
        mustChangePassword: true,
        role,
        status: d.status,
        laborGroup: d.laborGroup,
        pledgeClassId: pc.id,
        notes: d.notes ?? null,
        ...selfValues(d),
      })
      .returning({ id: members.id })
      .get();

    logAudit({
      actorId: actor.id,
      action: "member.create",
      entityType: "member",
      entityId: row.id,
      summary: `${actor.username} added ${d.firstName} ${d.lastName} (${username}) as ${role}, status ${d.status}`,
    });
    revalidatePath("/members");
    redirect(`/members/${row.id}?created=1`);
  });
}

function valuesOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$ACTION") && !/password/i.test(k)) out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export async function updateMember(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireUserForAction();
    const memberId = Number(formData.get("memberId"));
    if (!Number.isInteger(memberId) || memberId <= 0) return fail("Not found.");
    const existing = db.select().from(members).where(eq(members.id, memberId)).get();
    if (!existing) return fail("Not found.");

    const canManage = can(actor, "members.manage");
    const isSelf = actor.id === existing.id;
    if (!canManage && !isSelf) return fail("You can only edit your own profile.");

    const now = new Date().toISOString();

    if (!canManage) {
      const parsed = parseForm(selfSchema, formData);
      if ("result" in parsed) return parsed.result;
      const d = parsed.data;
      const next = { preferredName: d.preferredName || existing.firstName, ...selfValues(d) };
      const changed = changedKeys(existing as unknown as Record<string, unknown>, next);
      db.update(members)
        .set({ ...next, updatedAt: now })
        .where(eq(members.id, memberId))
        .run();
      logAudit({
        actorId: actor.id,
        action: "member.update",
        entityType: "member",
        entityId: memberId,
        summary: `${actor.username} updated their profile${changed.length ? ` (${changed.join(", ")})` : ""}`,
      });
      revalidatePath("/members");
      revalidatePath(`/members/${memberId}`);
      redirect(`/members/${memberId}?saved=1`);
    }

    const parsed = parseForm(manageSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d: ManageData = parsed.data;

    const username = normalizeUsername(d.username ?? existing.username);
    if (!isValidUsername(username)) {
      const msg = "Usernames are 3 to 40 characters: lowercase letters, numbers, dots and dashes.";
      return fail(msg, { username: [msg] }, valuesOf(formData));
    }
    if (usernameTaken(username, memberId)) {
      const msg = "That username is taken.";
      return fail(msg, { username: [msg] }, valuesOf(formData));
    }

    const pc = resolvePledgeClass(d.pledgeClassId);
    if (!pc.ok) return fail(pc.error, { pledgeClassId: [pc.error] }, valuesOf(formData));

    // Role rules: only admins grant or remove admin; nobody removes their own admin role.
    const role: Member["role"] = d.role ?? existing.role;
    if (role !== existing.role) {
      if ((role === "admin" || existing.role === "admin") && actor.role !== "admin") {
        return fail("Only an admin can grant or remove the admin role.", { role: ["Only admins can change this."] }, valuesOf(formData));
      }
      if (isSelf && existing.role === "admin") {
        return fail("You cannot remove your own admin role.", { role: ["Ask another admin."] }, valuesOf(formData));
      }
    }
    if (isSelf && d.status !== existing.status && (d.status === "inactive" || d.status === "alumni")) {
      return fail("You cannot deactivate your own account.", { status: ["Ask another admin."] }, valuesOf(formData));
    }

    const next = {
      firstName: d.firstName,
      lastName: d.lastName,
      preferredName: d.preferredName || d.firstName,
      username,
      status: d.status,
      laborGroup: d.laborGroup,
      pledgeClassId: pc.id,
      role,
      notes: d.notes ?? null,
      ...selfValues(d),
    };
    const changed = changedKeys(existing as unknown as Record<string, unknown>, next);
    db.update(members)
      .set({ ...next, updatedAt: now })
      .where(eq(members.id, memberId))
      .run();

    const who = displayName(existing);
    logAudit({
      actorId: actor.id,
      action: "member.update",
      entityType: "member",
      entityId: memberId,
      summary: `${actor.username} edited ${who}${changed.length ? ` (${changed.join(", ")})` : " (no changes)"}`,
    });
    if (role !== existing.role) {
      logAudit({ actorId: actor.id, action: "member.role", entityType: "member", entityId: memberId, summary: `${actor.username} changed ${who}'s role from ${existing.role} to ${role}` });
    }
    if (d.status !== existing.status) {
      logAudit({ actorId: actor.id, action: "member.status", entityType: "member", entityId: memberId, summary: `${actor.username} changed ${who}'s status from ${existing.status} to ${d.status}` });
      if (d.status === "inactive" || d.status === "alumni") destroyAllSessionsFor(memberId);
    }
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/chairs");
    redirect(`/members/${memberId}?saved=1`);
  });
}

/* ------------------------------------------------------------------ */
/* Status (deactivate / reactivate)                                    */
/* ------------------------------------------------------------------ */

export async function setMemberStatus(memberId: number, status: "active" | "inactive"): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("members.manage");
    const existing = db.select().from(members).where(eq(members.id, memberId)).get();
    if (!existing) return fail("Not found.");
    if (existing.id === actor.id && status === "inactive") return fail("You cannot deactivate your own account.");
    if (existing.status === status) return ok(status === "active" ? "Already active." : "Already inactive.");
    db.update(members).set({ status, updatedAt: new Date().toISOString() }).where(eq(members.id, memberId)).run();
    if (status === "inactive") destroyAllSessionsFor(memberId);
    logAudit({
      actorId: actor.id,
      action: "member.status",
      entityType: "member",
      entityId: memberId,
      summary: `${actor.username} ${status === "active" ? "reactivated" : "deactivated"} ${displayName(existing)} (was ${existing.status})`,
    });
    revalidatePath("/members");
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/chairs");
    return ok(status === "active" ? "Member reactivated." : "Member deactivated.");
  });
}

/** Form wrapper for the Deactivate / Reactivate ConfirmButtons: hidden inputs `memberId` and `status`. */
export async function setMemberStatusForm(formData: FormData): Promise<void> {
  const memberId = Number(formData.get("memberId"));
  const status = formData.get("status") === "active" ? "active" : "inactive";
  const result = await setMemberStatus(memberId, status);
  redirect(`/members/${memberId}?${result.ok ? `ok=${encodeURIComponent(result.message ?? "Saved.")}` : `error=${encodeURIComponent(result.error)}`}`);
}

/* ------------------------------------------------------------------ */
/* Password reset (delegates to auth.resetMemberPassword)              */
/* ------------------------------------------------------------------ */

const resetSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  temporaryPassword: z.string().min(1, "Enter a temporary password."),
});

export async function resetPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermissionForAction("members.manage");
    const parsed = parseForm(resetSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { memberId, temporaryPassword } = parsed.data;
    const existing = db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).get();
    if (!existing) return fail("Not found.");
    const result = await resetMemberPassword(memberId, temporaryPassword);
    if (result.ok) revalidatePath(`/members/${memberId}`);
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* Pledge classes                                                      */
/* ------------------------------------------------------------------ */

const classFields = {
  name: z.string().trim().min(1, "Enter a name.").max(40),
  sortOrder: z.coerce.number().int("Whole numbers only.").min(-1000).max(1000).optional(),
  semesterLabel: optionalText(40),
  notes: optionalText(500),
};
const createClassSchema = z.object(classFields);
const updateClassSchema = z.object({ ...classFields, id: z.coerce.number().int().positive() });

function classNameTaken(name: string, excludeId?: number): boolean {
  const row = db.select({ id: pledgeClasses.id }).from(pledgeClasses).where(sql`lower(${pledgeClasses.name}) = lower(${name})`).get();
  return !!row && row.id !== excludeId;
}

export async function createPledgeClass(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("members.manage");
    const parsed = parseForm(createClassSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    if (classNameTaken(d.name)) return fail("A pledge class with that name already exists.", { name: ["Already exists."] }, valuesOf(formData));
    const maxRow = db.select({ m: sql<number>`coalesce(max(${pledgeClasses.sortOrder}), 0)` }).from(pledgeClasses).get();
    const sortOrder = d.sortOrder ?? (maxRow?.m ?? 0) + 1;
    const row = db
      .insert(pledgeClasses)
      .values({ name: d.name, sortOrder, semesterLabel: d.semesterLabel ?? null, notes: d.notes ?? null })
      .returning({ id: pledgeClasses.id })
      .get();
    logAudit({ actorId: actor.id, action: "pledge_class.create", entityType: "pledge_class", entityId: row.id, summary: `${actor.username} added pledge class ${d.name}` });
    revalidatePath("/members/classes");
    revalidatePath("/members");
    return ok(`Added ${d.name}.`, row.id);
  });
}

export async function updatePledgeClass(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("members.manage");
    const parsed = parseForm(updateClassSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const existing = getPledgeClass(d.id);
    if (!existing) return fail("Not found.");
    if (classNameTaken(d.name, d.id)) return fail("A pledge class with that name already exists.", { name: ["Already exists."] }, valuesOf(formData));
    db.update(pledgeClasses)
      .set({ name: d.name, sortOrder: d.sortOrder ?? existing.sortOrder, semesterLabel: d.semesterLabel ?? null, notes: d.notes ?? null })
      .where(eq(pledgeClasses.id, d.id))
      .run();
    logAudit({ actorId: actor.id, action: "pledge_class.update", entityType: "pledge_class", entityId: d.id, summary: `${actor.username} edited pledge class ${existing.name}${existing.name !== d.name ? ` (now ${d.name})` : ""}` });
    revalidatePath("/members/classes");
    revalidatePath("/members");
    return ok("Saved.", d.id);
  });
}

export async function deletePledgeClass(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermissionForAction("members.manage");
    const existing = getPledgeClass(id);
    if (!existing) return fail("Not found.");
    const count = db.select({ n: sql<number>`count(*)` }).from(members).where(eq(members.pledgeClassId, id)).get();
    if ((count?.n ?? 0) > 0) return fail(`${existing.name} still has ${count!.n} member${count!.n === 1 ? "" : "s"}. Move them first.`);
    db.delete(pledgeClasses).where(eq(pledgeClasses.id, id)).run();
    logAudit({ actorId: actor.id, action: "pledge_class.delete", entityType: "pledge_class", entityId: id, summary: `${actor.username} deleted pledge class ${existing.name}` });
    revalidatePath("/members/classes");
    revalidatePath("/members");
    return ok(`Deleted ${existing.name}.`);
  });
}

/** Form wrapper for the Delete ConfirmButton: hidden input `id`. */
export async function deletePledgeClassForm(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const result = await deletePledgeClass(id);
  redirect(`/members/classes?${result.ok ? `ok=${encodeURIComponent(result.message ?? "Deleted.")}` : `error=${encodeURIComponent(result.error)}`}`);
}
