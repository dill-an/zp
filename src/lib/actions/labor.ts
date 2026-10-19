"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  charges,
  duesPeriods,
  excuseRequests,
  JOB_CATEGORIES,
  JOB_KINDS,
  jobAssignments,
  jobSwapRequests,
  jobTypes,
  laborWeeks,
  members,
  sanctions,
} from "@/db/schema";
import { fail, formValues, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth";
import { can, type CurrentUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { addDaysISO, formatDate, nowISO, todayISO } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { autoFill, isSunday, isValidISODate, loadsFromStats, weekIsUntouched } from "@/lib/queries/labor-logic";
import {
  countJobTypeAssignments,
  getAssignment,
  getJobType,
  getLaborPool,
  getLaborStats,
  getPreviousWeek,
  getWeek,
  getWeekAssignments,
  getWeekById,
  listJobTypes,
  type AssignmentDetail,
} from "@/lib/queries/labor";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function revalidateLabor(extra: string[] = []) {
  revalidatePath("/labor", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/members", "layout");
  for (const p of extra) revalidatePath(p);
}

const idField = z.coerce.number().int().positive();
const weekStartField = z.string().trim().refine(isValidISODate, "Enter a date as YYYY-MM-DD.").refine(isSunday, "A labor week starts on a Sunday.");

function describe(a: AssignmentDetail): string {
  return `${a.jobType.name} (week of ${formatDate(a.weekStart)})`;
}

function touch(assignmentId: number, set: Partial<typeof jobAssignments.$inferInsert>) {
  db.update(jobAssignments)
    .set({ ...set, updatedAt: nowISO() })
    .where(eq(jobAssignments.id, assignmentId))
    .run();
}

function appendNote(existing: string | null, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}

function isAssignee(user: CurrentUser, a: AssignmentDetail): boolean {
  return a.memberId === user.id;
}

function isManager(user: CurrentUser): boolean {
  return can(user, "labor.manage");
}

/** Only the assignee or a labor manager may act on an assignment. */
function requireAssigneeOrManager(user: CurrentUser, a: AssignmentDetail): ActionResult | null {
  if (isAssignee(user, a) || isManager(user)) return null;
  return fail("Only the brother assigned to this job can do that.");
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

const createWeekSchema = z.object({
  weekStart: weekStartField,
  mode: z.enum(["empty", "copy", "autofill"]).default("empty"),
});

/**
 * Create a labor week: empty, copied from the most recent earlier week, or auto-filled. Empty and
 * copied weeks are posted right away (the manager chose every name, or last week's names). An
 * auto-filled week is saved as a draft so the manager reviews the machine's picks before brothers
 * see them; both of those land in manage mode.
 */
export async function createWeek(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let target: string | null = null;
  let skippedNote = "";
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(createWeekSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { weekStart, mode } = parsed.data;
    if (getWeek(weekStart)) return fail("That week already exists.");
    const week = db.insert(laborWeeks).values({ weekStart, isPublished: mode !== "autofill", createdById: user.id }).returning().get();
    let created = 0;
    if (mode === "copy") {
      const prev = getPreviousWeek(weekStart);
      if (!prev) {
        db.delete(laborWeeks).where(eq(laborWeeks.id, week.id)).run();
        return fail("There is no earlier week to copy from.");
      }
      const activeIds = new Set(listJobTypes().map((jt) => jt.id));
      // Brothers who left the house are not copied; everyone else keeps their job (the same rule manual
      // assigning uses). Whatever is left out is written into the week notes so the open slot is explained.
      const skipped: string[] = [];
      for (const a of getWeekAssignments(prev.id)) {
        if (!activeIds.has(a.jobTypeId)) continue;
        if (a.member.status === "inactive" || a.member.status === "alumni") {
          skipped.push(`${displayName(a.member)} (${a.jobType.name})`);
          continue;
        }
        db.insert(jobAssignments).values({ weekId: week.id, jobTypeId: a.jobTypeId, memberId: a.memberId, slot: a.slot, status: "assigned" }).run();
        created += 1;
      }
      if (skipped.length) {
        skippedNote = `Not copied from the week of ${formatDate(prev.weekStart)} (no longer active): ${skipped.join(", ")}.`;
        db.update(laborWeeks).set({ notes: skippedNote }).where(eq(laborWeeks.id, week.id)).run();
      }
    } else if (mode === "autofill") {
      created = fillWeek(week.id, weekStart);
    }
    logAudit({
      actorId: user.id,
      action: "labor.week.create",
      entityType: "labor_week",
      entityId: week.id,
      summary: `${user.username} created the labor week of ${weekStart} (${mode}, ${created} assignments${mode === "autofill" ? ", draft" : ""})${skippedNote ? `; ${skippedNote}` : ""}`,
    });
    revalidateLabor();
    if (mode === "empty" || mode === "autofill") target = `/labor/week/${weekStart}?manage=1`;
    return ok(mode === "copy" ? `Week created with ${created} assignments copied.${skippedNote ? ` ${skippedNote}` : ""}` : mode === "autofill" ? `Draft week created and ${created} slots filled.` : "Week created.");
  });
  if (target) redirect(target);
  return result;
}

/** Fill every empty slot in a week. Returns the number of new assignments. */
function fillWeek(weekId: number, weekStart: string): number {
  const stats = getLaborStats({ includeUnpublished: true });
  const picks = autoFill({
    weekStart,
    jobTypes: listJobTypes(),
    existing: getWeekAssignments(weekId).map((a) => ({ jobTypeId: a.jobTypeId, memberId: a.memberId, slot: a.slot })),
    pool: getLaborPool().map((m) => ({ id: m.id, laborGroup: m.laborGroup })),
    loads: loadsFromStats(stats),
  });
  for (const p of picks) db.insert(jobAssignments).values({ weekId, jobTypeId: p.jobTypeId, memberId: p.memberId, slot: p.slot, status: "assigned" }).run();
  return picks.length;
}

const weekIdSchema = z.object({ weekId: idField });

export async function autoFillWeek(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(weekIdSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    const n = fillWeek(week.id, week.weekStart);
    logAudit({ actorId: user.id, action: "labor.week.autofill", entityType: "labor_week", entityId: week.id, summary: `${user.username} auto-filled ${n} slots for the week of ${week.weekStart}` });
    revalidateLabor();
    return ok(n ? `Filled ${n} empty slot${n === 1 ? "" : "s"}.` : "No empty slots to fill.");
  });
}

/** Remove every untouched (plain assigned) assignment from the week. */
export async function clearWeek(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(weekIdSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    const all = getWeekAssignments(week.id);
    const removable = all.filter((a) => a.status === "assigned" && !a.completedAt && !a.verifiedAt);
    if (removable.length) db.delete(jobAssignments).where(inArray(jobAssignments.id, removable.map((a) => a.id))).run();
    logAudit({ actorId: user.id, action: "labor.week.clear", entityType: "labor_week", entityId: week.id, summary: `${user.username} cleared ${removable.length} assignments from the week of ${week.weekStart}` });
    revalidateLabor();
    const kept = all.length - removable.length;
    return ok(kept ? `Cleared ${removable.length} assignments; ${kept} already done or resolved were kept.` : `Cleared ${removable.length} assignments.`);
  });
}

const publishSchema = z.object({ weekId: idField, published: z.enum(["0", "1"]) });

export async function setWeekPublished(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(publishSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    const published = parsed.data.published === "1";
    db.update(laborWeeks).set({ isPublished: published }).where(eq(laborWeeks.id, week.id)).run();
    logAudit({ actorId: user.id, action: published ? "labor.week.publish" : "labor.week.unpublish", entityType: "labor_week", entityId: week.id, summary: `${user.username} ${published ? "published" : "unpublished"} the week of ${week.weekStart}` });
    revalidateLabor();
    return ok(published ? "Week posted." : "Week hidden from brothers.");
  });
}

const notesSchema = z.object({ weekId: idField, notes: z.string().trim().max(2000).optional() });

export async function updateWeekNotes(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(notesSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    db.update(laborWeeks).set({ notes: parsed.data.notes ?? null }).where(eq(laborWeeks.id, week.id)).run();
    logAudit({ actorId: user.id, action: "labor.week.notes", entityType: "labor_week", entityId: week.id, summary: `${user.username} updated notes for the week of ${week.weekStart}` });
    revalidateLabor();
    return ok("Notes saved.");
  });
}

export async function deleteWeek(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let done = false;
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(weekIdSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    if (!weekIsUntouched(getWeekAssignments(week.id))) return fail("This week has jobs that were done, missed or excused; reset them before deleting it.");
    db.delete(laborWeeks).where(eq(laborWeeks.id, week.id)).run();
    logAudit({ actorId: user.id, action: "labor.week.delete", entityType: "labor_week", entityId: week.id, summary: `${user.username} deleted the labor week of ${week.weekStart}` });
    revalidateLabor();
    done = true;
    return ok("Week deleted.");
  });
  if (done) redirect("/labor");
  return result;
}

/* ------------------------------------------------------------------ */
/* Assigning                                                           */
/* ------------------------------------------------------------------ */

const rowSchema = z.object({ weekId: idField, jobTypeId: idField });

/** Save every slot of one job row from manage mode (fields `slot_1`, `slot_2`, ...). */
export async function saveRowAssignments(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(rowSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    const jobType = getJobType(parsed.data.jobTypeId);
    if (!week || !jobType) return fail("Not found.");
    // Failures echo the submitted picks so the row keeps what the manager chose (React resets the form).
    const reject = (message: string) => fail(message, undefined, formValues(formData));
    const existing = getWeekAssignments(week.id).filter((a) => a.jobTypeId === jobType.id);
    const slotCount = Math.max(jobType.slots, ...existing.map((a) => a.slot), 1);
    const wanted: { slot: number; memberId: number | null }[] = [];
    for (let s = 1; s <= slotCount; s++) {
      const raw = formData.get(`slot_${s}`);
      // Locked slots render a disabled select, which the browser leaves out of the form: leave them as they are.
      if (raw === null) continue;
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) {
        wanted.push({ slot: s, memberId: null });
        continue;
      }
      const memberId = Number(value);
      if (!Number.isInteger(memberId) || memberId <= 0) return reject(`Slot ${s}: pick a brother from the list.`);
      wanted.push({ slot: s, memberId });
    }
    const chosen = wanted.map((w) => w.memberId).filter((id): id is number => id != null);
    if (new Set(chosen).size !== chosen.length) return reject("The same brother cannot take two slots of one job.");
    if (chosen.length) {
      const found = db.select({ id: members.id, status: members.status }).from(members).where(inArray(members.id, chosen)).all();
      for (const id of chosen) {
        const m = found.find((f) => f.id === id);
        if (!m) return reject("Not found.");
        if (m.status === "inactive" || m.status === "alumni") return reject("That brother is no longer active.");
      }
    }
    const changes: string[] = [];
    for (const w of wanted) {
      const current = existing.find((a) => a.slot === w.slot) ?? null;
      if (current?.memberId === w.memberId) continue;
      if (current && (current.status !== "assigned" || current.completedAt || current.verifiedAt)) {
        return reject(`Slot ${w.slot} (${displayName(current.member)}) is already ${current.status}; reset it on the Verify page before changing it.`);
      }
      if (w.memberId == null) {
        if (current) {
          db.delete(jobAssignments).where(eq(jobAssignments.id, current.id)).run();
          changes.push(`removed ${displayName(current.member)} from slot ${w.slot}`);
        }
        continue;
      }
      const name = displayName(db.select({ firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName }).from(members).where(eq(members.id, w.memberId)).get()!);
      if (current) {
        touch(current.id, { memberId: w.memberId, status: "assigned", completedAt: null, verifiedAt: null, verifiedById: null });
        changes.push(`slot ${w.slot}: ${displayName(current.member)} -> ${name}`);
      } else {
        db.insert(jobAssignments).values({ weekId: week.id, jobTypeId: jobType.id, memberId: w.memberId, slot: w.slot, status: "assigned" }).run();
        changes.push(`slot ${w.slot}: ${name}`);
      }
    }
    if (!changes.length) return ok("No changes.");
    logAudit({
      actorId: user.id,
      action: "labor.assign",
      entityType: "labor_week",
      entityId: week.id,
      summary: `${user.username} updated ${jobType.name} for the week of ${week.weekStart}: ${changes.join("; ")}`,
    });
    revalidateLabor();
    return ok("Saved.");
  });
}

/* ------------------------------------------------------------------ */
/* Status changes                                                      */
/* ------------------------------------------------------------------ */

const assignmentIdSchema = z.object({ assignmentId: idField });

function loadAssignment(formData: FormData): { a: AssignmentDetail } | { result: ActionResult } {
  const parsed = parseForm(assignmentIdSchema, formData);
  if ("result" in parsed) return parsed;
  const a = getAssignment(parsed.data.assignmentId);
  return a ? { a } : { result: fail("Not found.") };
}

/** Assignee (or manager, on their behalf) marks a job done. */
export async function markDone(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const loaded = loadAssignment(formData);
    if ("result" in loaded) return loaded.result;
    const { a } = loaded;
    const denied = requireAssigneeOrManager(user, a);
    if (denied) return denied;
    if (a.status === "done") return ok("Already marked done.");
    if (a.status !== "assigned") return fail(`This job is marked ${a.status}; ask a labor manager to reset it.`);
    touch(a.id, { status: "done", completedAt: nowISO() });
    const onBehalf = !isAssignee(user, a);
    logAudit({
      actorId: user.id,
      action: "labor.assignment.done",
      entityType: "job_assignment",
      entityId: a.id,
      summary: `${user.username} marked ${describe(a)} done${onBehalf ? ` for ${displayName(a.member)}` : ""}`,
    });
    revalidateLabor();
    return ok("Marked done.");
  });
}

/** Back to assigned, only while not verified. */
export async function undoDone(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const loaded = loadAssignment(formData);
    if ("result" in loaded) return loaded.result;
    const { a } = loaded;
    const denied = requireAssigneeOrManager(user, a);
    if (denied) return denied;
    if (a.status !== "done") return fail("This job is not marked done.");
    if (a.verifiedAt && !isManager(user)) return fail("This job was already verified; ask a labor manager to reset it.");
    touch(a.id, { status: "assigned", completedAt: null, verifiedAt: null, verifiedById: null });
    logAudit({ actorId: user.id, action: "labor.assignment.undo", entityType: "job_assignment", entityId: a.id, summary: `${user.username} undid done on ${describe(a)}` });
    revalidateLabor();
    return ok("Back to assigned.");
  });
}

/** Manager confirms a done job (status stays `done`; verifiedById/verifiedAt are set). */
export async function verifyAssignment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const loaded = loadAssignment(formData);
    if ("result" in loaded) return loaded.result;
    const { a } = loaded;
    if (a.status !== "done") return fail("Only jobs marked done can be verified.");
    if (a.verifiedAt) return ok("Already verified.");
    touch(a.id, { verifiedById: user.id, verifiedAt: nowISO() });
    logAudit({ actorId: user.id, action: "labor.assignment.verify", entityType: "job_assignment", entityId: a.id, summary: `${user.username} verified ${describe(a)} for ${displayName(a.member)}` });
    revalidateLabor();
    return ok("Verified.");
  });
}

export async function verifyAllDone(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(weekIdSchema, formData);
    if ("result" in parsed) return parsed.result;
    const week = getWeekById(parsed.data.weekId);
    if (!week) return fail("Not found.");
    const pending = getWeekAssignments(week.id).filter((a) => a.status === "done" && !a.verifiedAt);
    const at = nowISO();
    for (const a of pending) touch(a.id, { verifiedById: user.id, verifiedAt: at });
    if (pending.length) {
      logAudit({ actorId: user.id, action: "labor.assignment.verify_all", entityType: "labor_week", entityId: week.id, summary: `${user.username} verified ${pending.length} done jobs for the week of ${week.weekStart}` });
    }
    revalidateLabor();
    return ok(pending.length ? `Verified ${pending.length} job${pending.length === 1 ? "" : "s"}.` : "Nothing waiting for verification.");
  });
}

export async function markExcused(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const loaded = loadAssignment(formData);
    if ("result" in loaded) return loaded.result;
    const { a } = loaded;
    if (a.status === "excused") return ok("Already excused.");
    touch(a.id, { status: "excused", completedAt: null, verifiedAt: null, verifiedById: null });
    logAudit({ actorId: user.id, action: "labor.assignment.excuse", entityType: "job_assignment", entityId: a.id, summary: `${user.username} excused ${displayName(a.member)} from ${describe(a)}` });
    revalidateLabor();
    return ok("Marked excused.");
  });
}

export async function resetAssignment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const loaded = loadAssignment(formData);
    if ("result" in loaded) return loaded.result;
    const { a } = loaded;
    if (a.status === "assigned" && !a.completedAt && !a.verifiedAt) return ok("Already assigned.");
    touch(a.id, { status: "assigned", completedAt: null, verifiedAt: null, verifiedById: null });
    logAudit({ actorId: user.id, action: "labor.assignment.reset", entityType: "job_assignment", entityId: a.id, summary: `${user.username} reset ${describe(a)} for ${displayName(a.member)} to assigned` });
    revalidateLabor();
    return ok("Reset to assigned.");
  });
}

const missedSchema = z.object({ assignmentId: idField, issueSanction: z.string().optional() });

/** Mark a job missed; optionally issue a make-up sanction and the configured fine. */
export async function markMissed(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(missedSchema, formData);
    if ("result" in parsed) return parsed.result;
    const a = getAssignment(parsed.data.assignmentId);
    if (!a) return fail("Not found.");
    if (a.status === "missed") return ok("Already marked missed.");
    const issue = parsed.data.issueSanction === "on" || parsed.data.issueSanction === "1";
    touch(a.id, { status: "missed", completedAt: null, verifiedAt: null, verifiedById: null });
    logAudit({ actorId: user.id, action: "labor.assignment.missed", entityType: "job_assignment", entityId: a.id, summary: `${user.username} marked ${describe(a)} missed for ${displayName(a.member)}` });
    let message = "Marked missed.";
    if (issue) {
      const weekLabel = formatDate(a.weekStart);
      const today = todayISO();
      const sanction = db
        .insert(sanctions)
        .values({
          memberId: a.memberId,
          issuedById: user.id,
          reason: `Missed ${a.jobType.name} (week of ${weekLabel})`,
          jobDescription: `Make-up clean: ${a.jobType.name}`,
          source: "missed_clean",
          sourceRef: String(a.id),
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          status: "open",
        })
        .returning({ id: sanctions.id })
        .get();
      const fineCents = Number(getSetting(SETTING_KEYS.missedCleanFineCents) || 0);
      let fineNote = "";
      if (Number.isFinite(fineCents) && fineCents > 0) {
        const period = db.select({ id: duesPeriods.id }).from(duesPeriods).where(eq(duesPeriods.isActive, true)).get();
        db.update(sanctions).set({ fineCents, updatedAt: nowISO() }).where(eq(sanctions.id, sanction.id)).run();
        db.insert(charges)
          .values({
            memberId: a.memberId,
            periodId: period?.id ?? null,
            kind: "fine",
            description: `Missed clean fine: ${a.jobType.name} (week of ${weekLabel})`,
            amountCents: fineCents,
            dueDate: addDaysISO(today, 14),
            sanctionId: sanction.id,
            createdById: user.id,
          })
          .run();
        fineNote = ` and a $${(fineCents / 100).toFixed(2)} fine`;
      }
      logAudit({
        actorId: user.id,
        action: "sanction.issue",
        entityType: "sanction",
        entityId: sanction.id,
        summary: `${user.username} issued a make-up sanction${fineNote} to ${displayName(a.member)} for missing ${describe(a)}`,
      });
      message = `Marked missed; make-up sanction${fineNote} issued.`;
      revalidatePath("/sanctions", "layout");
      revalidatePath("/dues", "layout");
    }
    revalidateLabor();
    return ok(message);
  });
}

/* ------------------------------------------------------------------ */
/* Swap requests                                                       */
/* ------------------------------------------------------------------ */

const swapSchema = z.object({
  assignmentId: idField,
  targetMemberId: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function requestSwap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(swapSchema, formData);
    if ("result" in parsed) return parsed.result;
    const a = getAssignment(parsed.data.assignmentId);
    if (!a) return fail("Not found.");
    if (!isAssignee(user, a)) return fail("You can only request a swap for your own job.");
    if (a.status !== "assigned") return fail("Only open jobs can be swapped.");
    const open = db
      .select({ id: jobSwapRequests.id })
      .from(jobSwapRequests)
      .where(and(eq(jobSwapRequests.assignmentId, a.id), inArray(jobSwapRequests.status, ["pending", "accepted"])))
      .get();
    if (open) return fail("There is already an open swap request for this job.");
    const targetId = parsed.data.targetMemberId ?? null;
    let targetName = "";
    if (targetId != null) {
      if (targetId === user.id) return fail("Pick a different brother.");
      const target = db.select({ firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName, status: members.status }).from(members).where(eq(members.id, targetId)).get();
      if (!target || target.status === "inactive" || target.status === "alumni") return fail("Not found.");
      targetName = displayName(target);
    }
    const row = db
      .insert(jobSwapRequests)
      .values({ assignmentId: a.id, requestedById: user.id, targetMemberId: targetId, reason: parsed.data.reason ?? null, status: "pending" })
      .returning({ id: jobSwapRequests.id })
      .get();
    logAudit({
      actorId: user.id,
      action: "labor.swap.request",
      entityType: "job_swap_request",
      entityId: row.id,
      summary: `${user.username} asked to swap ${describe(a)}${targetName ? ` with ${targetName}` : " (open request)"}`,
    });
    revalidateLabor();
    return ok(targetName ? `Swap requested; waiting for ${targetName} to accept.` : "Open swap request posted.");
  });
}

const swapIdSchema = z.object({ swapId: idField });

function loadSwap(formData: FormData) {
  const parsed = parseForm(swapIdSchema, formData);
  if ("result" in parsed) return parsed;
  const row = db.select().from(jobSwapRequests).where(eq(jobSwapRequests.id, parsed.data.swapId)).get();
  if (!row) return { result: fail("Not found.") };
  const a = getAssignment(row.assignmentId);
  if (!a) return { result: fail("Not found.") };
  return { row, a };
}

export async function cancelSwap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const loaded = loadSwap(formData);
    if ("result" in loaded) return loaded.result;
    const { row, a } = loaded;
    if (row.requestedById !== user.id && !isManager(user)) return fail("Only the brother who asked can cancel this request.");
    if (row.status !== "pending" && row.status !== "accepted") return fail("This request is already closed.");
    db.update(jobSwapRequests).set({ status: "cancelled", resolvedById: user.id, resolvedAt: nowISO() }).where(eq(jobSwapRequests.id, row.id)).run();
    logAudit({ actorId: user.id, action: "labor.swap.cancel", entityType: "job_swap_request", entityId: row.id, summary: `${user.username} cancelled the swap request for ${describe(a)}` });
    revalidateLabor();
    return ok("Request cancelled.");
  });
}

/** The targeted brother (or, for an open request, any eligible brother) agrees to take the job. */
export async function acceptSwap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const loaded = loadSwap(formData);
    if ("result" in loaded) return loaded.result;
    const { row, a } = loaded;
    if (row.status !== "pending") return fail("This request is no longer open.");
    if (row.requestedById === user.id) return fail("You cannot accept your own request.");
    if (row.targetMemberId != null && row.targetMemberId !== user.id) return fail("This request was sent to someone else.");
    if (a.status !== "assigned") return fail("That job is no longer open.");
    db.update(jobSwapRequests).set({ status: "accepted", targetMemberId: user.id }).where(eq(jobSwapRequests.id, row.id)).run();
    logAudit({ actorId: user.id, action: "labor.swap.accept", entityType: "job_swap_request", entityId: row.id, summary: `${user.username} agreed to take ${describe(a)} from ${displayName(a.member)}` });
    revalidateLabor();
    return ok("Accepted; a labor manager will confirm the swap.");
  });
}

/** Target brother turns the request down, or a manager declines it. */
export async function declineSwap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const loaded = loadSwap(formData);
    if ("result" in loaded) return loaded.result;
    const { row, a } = loaded;
    const manager = isManager(user);
    if (!manager && row.targetMemberId !== user.id) return fail("Only the brother asked (or a labor manager) can decline this request.");
    if (row.status !== "pending" && row.status !== "accepted") return fail("This request is already closed.");
    if (!manager && row.status !== "pending") return fail("This request is already closed.");
    db.update(jobSwapRequests).set({ status: "declined", resolvedById: user.id, resolvedAt: nowISO() }).where(eq(jobSwapRequests.id, row.id)).run();
    logAudit({ actorId: user.id, action: "labor.swap.decline", entityType: "job_swap_request", entityId: row.id, summary: `${user.username} declined the swap request for ${describe(a)}` });
    revalidateLabor();
    return ok("Request declined.");
  });
}

/** Manager approves: the job moves to the accepting brother and the request closes as approved. */
export async function approveSwap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const loaded = loadSwap(formData);
    if ("result" in loaded) return loaded.result;
    const { row, a } = loaded;
    if (row.status === "approved" || row.status === "declined" || row.status === "cancelled") return fail("This request is already closed.");
    if (row.targetMemberId == null) return fail("No brother has claimed this open request yet.");
    if (row.status !== "accepted") return fail("The brother asked has not accepted this swap yet.");
    // The job may have been handed to someone else since the request was made (manual reassignment,
    // another swap); never move a job out from under a brother who did not ask for it.
    if (row.requestedById !== a.memberId) return fail(`${displayName(a.member)} now holds this job, not the brother who asked for the swap; decline this request.`);
    if (a.status !== "assigned") return fail("That job is no longer open.");
    const target = db.select({ id: members.id, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName, status: members.status }).from(members).where(eq(members.id, row.targetMemberId)).get();
    if (!target || target.status === "inactive" || target.status === "alumni") return fail("The brother taking the job is no longer active.");
    const clash = getWeekAssignments(a.weekId).find((x) => x.jobTypeId === a.jobTypeId && x.memberId === target.id && x.id !== a.id);
    if (clash) return fail(`${displayName(target)} already has a slot on ${a.jobType.name} that week.`);
    const from = displayName(a.member);
    const to = displayName(target);
    touch(a.id, { memberId: target.id, notes: appendNote(a.notes, `Swapped from ${from} to ${to} (${formatDate(todayISO())})`) });
    db.update(jobSwapRequests).set({ status: "approved", resolvedById: user.id, resolvedAt: nowISO() }).where(eq(jobSwapRequests.id, row.id)).run();
    logAudit({ actorId: user.id, action: "labor.swap.approve", entityType: "job_assignment", entityId: a.id, summary: `${user.username} approved the swap of ${describe(a)} from ${from} to ${to}` });
    revalidateLabor();
    return ok(`Swapped: ${to} now has ${a.jobType.name}.`);
  });
}

/* ------------------------------------------------------------------ */
/* Excuse requests                                                     */
/* ------------------------------------------------------------------ */

const excuseSchema = z.object({ assignmentId: idField, reason: z.string().trim().min(3, "Say why you need to be excused.").max(1000) });

export async function requestExcuse(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(excuseSchema, formData);
    if ("result" in parsed) return parsed.result;
    const a = getAssignment(parsed.data.assignmentId);
    if (!a) return fail("Not found.");
    if (!isAssignee(user, a)) return fail("You can only request an excuse for your own job.");
    if (a.status !== "assigned") return fail("Only open jobs can be excused.");
    const open = db.select({ id: excuseRequests.id }).from(excuseRequests).where(and(eq(excuseRequests.assignmentId, a.id), eq(excuseRequests.status, "pending"))).get();
    if (open) return fail("You already have a pending excuse request for this job.");
    const row = db.insert(excuseRequests).values({ memberId: user.id, assignmentId: a.id, reason: parsed.data.reason, status: "pending" }).returning({ id: excuseRequests.id }).get();
    logAudit({ actorId: user.id, action: "labor.excuse.request", entityType: "excuse_request", entityId: row.id, summary: `${user.username} asked to be excused from ${describe(a)}` });
    revalidateLabor();
    return ok("Excuse requested; a labor manager will review it.");
  });
}

const reviewSchema = z.object({ excuseId: idField, decision: z.enum(["approve", "deny"]), note: z.string().trim().max(500).optional() });

export async function reviewExcuse(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(reviewSchema, formData);
    if ("result" in parsed) return parsed.result;
    const row = db.select().from(excuseRequests).where(eq(excuseRequests.id, parsed.data.excuseId)).get();
    if (!row || row.assignmentId == null) return fail("Not found.");
    if (row.status !== "pending") return fail("This request was already reviewed.");
    const a = getAssignment(row.assignmentId);
    if (!a) return fail("Not found.");
    const approve = parsed.data.decision === "approve";
    // An excuse only ever applies to the brother who asked. If the job moved to someone else since
    // (an approved swap, a manual reassignment), approving would excuse the new assignee instead.
    if (approve && row.memberId !== a.memberId) {
      return fail(`${displayName(a.member)} now holds this job; this excuse request no longer applies. Deny it instead.`);
    }
    db.update(excuseRequests)
      .set({ status: approve ? "approved" : "denied", reviewedById: user.id, reviewedAt: nowISO(), reviewNote: parsed.data.note ?? null })
      .where(eq(excuseRequests.id, row.id))
      .run();
    if (approve && a.status === "assigned") touch(a.id, { status: "excused" });
    logAudit({
      actorId: user.id,
      action: approve ? "labor.excuse.approve" : "labor.excuse.deny",
      entityType: "excuse_request",
      entityId: row.id,
      summary: `${user.username} ${approve ? "approved" : "denied"} ${displayName(a.member)}'s excuse for ${describe(a)}`,
    });
    revalidateLabor();
    return ok(approve ? "Excuse approved." : "Excuse denied.");
  });
}

/* ------------------------------------------------------------------ */
/* Job types                                                           */
/* ------------------------------------------------------------------ */

const jobTypeSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Enter a name.").max(80),
  kind: z.enum(JOB_KINDS),
  category: z.enum(JOB_CATEGORIES),
  windowLabel: z.string().trim().max(40).optional(),
  startOffsetDays: z.coerce.number().int().min(0).max(13),
  dueOffsetDays: z.coerce.number().int().min(0).max(14),
  slots: z.coerce.number().int().min(1).max(6),
  points: z.coerce.number().int().min(0).max(20),
  instructions: z.string().trim().max(2000).optional(),
  isActive: z.string().optional(),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});

export async function saveJobType(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let target: string | null = null;
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(jobTypeSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    if (d.dueOffsetDays < d.startOffsetDays) return fail("The due day cannot be before the start day.", { dueOffsetDays: ["Must be on or after the start day."] }, formValues(formData));
    const values = {
      name: d.name,
      kind: d.kind,
      category: d.category,
      windowLabel: d.windowLabel ?? null,
      startOffsetDays: d.startOffsetDays,
      dueOffsetDays: d.dueOffsetDays,
      slots: d.slots,
      points: d.points,
      instructions: d.instructions ?? null,
      isActive: d.isActive === "on" || d.isActive === "1",
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      const existing = getJobType(d.id);
      if (!existing) return fail("Not found.");
      db.update(jobTypes).set(values).where(eq(jobTypes.id, existing.id)).run();
      logAudit({ actorId: user.id, action: "labor.jobtype.update", entityType: "job_type", entityId: existing.id, summary: `${user.username} edited job type ${values.name}` });
    } else {
      const row = db.insert(jobTypes).values(values).returning({ id: jobTypes.id }).get();
      logAudit({ actorId: user.id, action: "labor.jobtype.create", entityType: "job_type", entityId: row.id, summary: `${user.username} created job type ${values.name}` });
    }
    revalidateLabor();
    target = "/labor/jobs";
    return ok("Saved.");
  });
  if (target) redirect(target);
  return result;
}

const jobTypeIdSchema = z.object({ id: idField });

export async function setJobTypeActive(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(jobTypeIdSchema.extend({ active: z.enum(["0", "1"]) }), formData);
    if ("result" in parsed) return parsed.result;
    const jt = getJobType(parsed.data.id);
    if (!jt) return fail("Not found.");
    const active = parsed.data.active === "1";
    db.update(jobTypes).set({ isActive: active }).where(eq(jobTypes.id, jt.id)).run();
    logAudit({ actorId: user.id, action: active ? "labor.jobtype.restore" : "labor.jobtype.archive", entityType: "job_type", entityId: jt.id, summary: `${user.username} ${active ? "restored" : "archived"} job type ${jt.name}` });
    revalidateLabor();
    return ok(active ? "Job type restored." : "Job type archived.");
  });
}

export async function deleteJobType(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("labor.manage");
    const parsed = parseForm(jobTypeIdSchema, formData);
    if ("result" in parsed) return parsed.result;
    const jt = getJobType(parsed.data.id);
    if (!jt) return fail("Not found.");
    if (countJobTypeAssignments(jt.id) > 0) return fail("This job has assignments; archive it instead.");
    db.delete(jobTypes).where(eq(jobTypes.id, jt.id)).run();
    logAudit({ actorId: user.id, action: "labor.jobtype.delete", entityType: "job_type", entityId: jt.id, summary: `${user.username} deleted job type ${jt.name}` });
    revalidateLabor();
    return ok("Job type deleted.");
  });
}
