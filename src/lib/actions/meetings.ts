"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  ATTENDANCE_STATUSES,
  attendance,
  charges,
  duesPeriods,
  excuseRequests,
  MEETING_KINDS,
  meetings,
  members,
  sanctions,
  type AttendanceStatus,
} from "@/db/schema";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { addDaysISO, dateAtLocalTime, formatDate, localInputToISO, nowISO, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { displayName } from "@/lib/names";
import { getFinePreview, getSanctionPreview } from "@/lib/queries/meetings";
import { meetingDateOnly, weeklySeries } from "@/lib/queries/meetings-logic";
import { can } from "@/lib/permissions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function revalidateMeetings(id?: number) {
  revalidatePath("/meetings", "layout");
  if (id) revalidatePath(`/meetings/${id}`);
  revalidatePath("/dashboard");
}

function meetingLabel(m: { title: string; scheduledAt: string }): string {
  return `${m.title} (${formatDate(meetingDateOnly(m.scheduledAt), { year: true })})`;
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

const meetingSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  kind: z.enum(MEETING_KINDS, { message: "Pick a kind." }),
  scheduledAt: z.string().min(1, "Pick a date and time."),
  location: z.string().trim().max(120).optional(),
  agenda: z.string().trim().max(5000).optional(),
  isMandatory: z.string().optional(),
});

export async function createMeeting(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const parsed = parseForm(meetingSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { title, kind, location, agenda, isMandatory } = parsed.data;
    const scheduledAt = localInputToISO(parsed.data.scheduledAt);
    if (!scheduledAt) return fail("Pick a valid date and time.");
    const row = db
      .insert(meetings)
      .values({ title, kind, scheduledAt, location: location ?? null, agenda: agenda ?? null, isMandatory: isMandatory === "on", createdById: user.id })
      .returning({ id: meetings.id })
      .get();
    logAudit({ actorId: user.id, action: "meeting.create", entityType: "meeting", entityId: row.id, summary: `${user.username} created ${meetingLabel({ title, scheduledAt })}` });
    revalidateMeetings(row.id);
    redirect(`/meetings/${row.id}`);
  });
}

export async function updateMeeting(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const existing = db.select().from(meetings).where(eq(meetings.id, id)).get();
    if (!existing) return fail("Not found.");
    const parsed = parseForm(meetingSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { title, kind, location, agenda, isMandatory } = parsed.data;
    const scheduledAt = localInputToISO(parsed.data.scheduledAt);
    if (!scheduledAt) return fail("Pick a valid date and time.");
    db.update(meetings)
      .set({ title, kind, scheduledAt, location: location ?? null, agenda: agenda ?? null, isMandatory: isMandatory === "on" })
      .where(eq(meetings.id, id))
      .run();
    logAudit({ actorId: user.id, action: "meeting.update", entityType: "meeting", entityId: id, summary: `${user.username} edited ${meetingLabel({ title, scheduledAt })}` });
    revalidateMeetings(id);
    redirect(`/meetings/${id}`);
  });
}

export async function deleteMeeting(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const existing = db.select().from(meetings).where(eq(meetings.id, id)).get();
    if (!existing) return fail("Not found.");
    db.delete(meetings).where(eq(meetings.id, id)).run();
    logAudit({ actorId: user.id, action: "meeting.delete", entityType: "meeting", entityId: id, summary: `${user.username} deleted ${meetingLabel(existing)}` });
    revalidateMeetings(id);
    redirect("/meetings");
  });
}

const seriesSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(120),
  kind: z.enum(MEETING_KINDS, { message: "Pick a kind." }),
  weekday: z.coerce.number().int().min(0).max(6),
  time: z.string().regex(TIME_RE, "Pick a time."),
  firstDate: z.string().regex(DATE_RE, "Pick the first date."),
  lastDate: z.string().regex(DATE_RE, "Pick the last date."),
  location: z.string().trim().max(120).optional(),
  isMandatory: z.string().optional(),
});

/** Creates one meeting per week; dates that already have a meeting of this kind are skipped. */
export async function createMeetingSeries(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const parsed = parseForm(seriesSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { title, kind, weekday, time, firstDate, lastDate, location, isMandatory } = parsed.data;
    if (lastDate < firstDate) return fail("The last date must be on or after the first date.", { lastDate: ["Must be on or after the first date."] });
    const dates = weeklySeries(firstDate, lastDate, weekday);
    if (dates.length === 0) return fail("No dates fall on that weekday between the two dates.");
    const taken = new Set(
      db
        .select({ scheduledAt: meetings.scheduledAt })
        .from(meetings)
        .where(and(eq(meetings.kind, kind), gte(meetings.scheduledAt, dateAtLocalTime(firstDate, "00:00")), lte(meetings.scheduledAt, dateAtLocalTime(addDaysISO(lastDate, 1), "00:00"))))
        .all()
        .map((m) => meetingDateOnly(m.scheduledAt)),
    );
    const fresh = dates.filter((d) => !taken.has(d));
    db.transaction((tx) => {
      for (const date of fresh) {
        tx.insert(meetings)
          .values({ title, kind, scheduledAt: dateAtLocalTime(date, time), location: location ?? null, isMandatory: isMandatory === "on", createdById: user.id })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: "meeting.series",
      entityType: "meeting",
      summary: `${user.username} created ${fresh.length} ${title} meetings (${firstDate} to ${lastDate}), skipped ${dates.length - fresh.length}`,
    });
    revalidateMeetings();
    const skipped = dates.length - fresh.length;
    return ok(`Created ${fresh.length} ${fresh.length === 1 ? "meeting" : "meetings"}${skipped ? `, skipped ${skipped} that already existed` : ""}.`);
  });
}

/* ------------------------------------------------------------------ */
/* Attendance                                                           */
/* ------------------------------------------------------------------ */

const STATUS_KEY = /^status_(\d+)$/;
const NOTE_KEY = /^note_(\d+)$/;

/** Upserts one attendance row per `status_<memberId>` field and marks attendance as taken. */
export async function saveAttendance(meetingId: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
    if (!meeting) return fail("Not found.");

    const statuses = new Map<number, AttendanceStatus>();
    const notes = new Map<number, string>();
    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string") continue;
      const s = STATUS_KEY.exec(key);
      if (s) {
        if (!(ATTENDANCE_STATUSES as readonly string[]).includes(value)) return fail("Invalid attendance status.");
        statuses.set(Number(s[1]), value as AttendanceStatus);
        continue;
      }
      const n = NOTE_KEY.exec(key);
      if (n) notes.set(Number(n[1]), value.trim().slice(0, 200));
    }
    if (statuses.size === 0) return fail("Nothing to save: mark at least one brother.");
    const ids = [...statuses.keys()];
    const known = new Set(db.select({ id: members.id }).from(members).where(inArray(members.id, ids)).all().map((m) => m.id));
    if (known.size !== ids.length) return fail("One of the brothers on the sheet no longer exists. Reload and try again.");

    const recordedAt = nowISO();
    db.transaction((tx) => {
      for (const [memberId, status] of statuses) {
        const note = notes.get(memberId) || null;
        tx.insert(attendance)
          .values({ meetingId, memberId, status, note, recordedById: user.id, recordedAt })
          .onConflictDoUpdate({ target: [attendance.meetingId, attendance.memberId], set: { status, note, recordedById: user.id, recordedAt } })
          .run();
      }
      tx.update(meetings).set({ attendanceTaken: true }).where(eq(meetings.id, meetingId)).run();
    });
    const counts = { present: 0, absent: 0, excused: 0, late: 0 };
    for (const s of statuses.values()) counts[s] += 1;
    logAudit({
      actorId: user.id,
      action: "attendance.save",
      entityType: "meeting",
      entityId: meetingId,
      summary: `${user.username} recorded attendance for ${meetingLabel(meeting)}: ${counts.present} present, ${counts.absent} absent, ${counts.excused} excused, ${counts.late} late`,
    });
    revalidateMeetings(meetingId);
    revalidatePath("/members", "layout");
    redirect(`/meetings/${meetingId}?saved=attendance`);
  });
}

const minutesSchema = z.object({ minutes: z.string().trim().max(20000, "Minutes are too long.").optional() });

export async function saveMinutes(meetingId: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
    if (!meeting) return fail("Not found.");
    const parsed = parseForm(minutesSchema, formData);
    if ("result" in parsed) return parsed.result;
    db.update(meetings).set({ minutes: parsed.data.minutes ?? null }).where(eq(meetings.id, meetingId)).run();
    logAudit({ actorId: user.id, action: "meeting.minutes", entityType: "meeting", entityId: meetingId, summary: `${user.username} updated minutes for ${meetingLabel(meeting)}` });
    revalidateMeetings(meetingId);
    return ok("Minutes saved.");
  });
}

/* ------------------------------------------------------------------ */
/* Fines and sanctions                                                  */
/* ------------------------------------------------------------------ */

/** Creates a fine charge for every absent member without one for this meeting. */
export async function fineAbsences(meetingId: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
    if (!meeting) return fail("Not found.");
    if (!meeting.attendanceTaken) return fail("Take attendance first.");
    const preview = getFinePreview(meeting);
    if (preview.amountCents <= 0) return fail("Set the missed meeting fine amount in Settings first.");
    if (preview.members.length === 0) return ok("Every absence for this meeting has already been fined.");
    const period = db.select({ id: duesPeriods.id }).from(duesPeriods).where(eq(duesPeriods.isActive, true)).orderBy(desc(duesPeriods.dueDate)).get();
    const dueDate = addDaysISO(todayISO(), 14);
    db.transaction((tx) => {
      for (const m of preview.members) {
        tx.insert(charges)
          .values({ memberId: m.id, periodId: period?.id ?? null, kind: "fine", description: preview.description, amountCents: preview.amountCents, dueDate, createdById: user.id })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: "attendance.fine",
      entityType: "meeting",
      entityId: meetingId,
      summary: `${user.username} fined ${preview.members.length} absence(s) ${formatCents(preview.amountCents)} each for ${meetingLabel(meeting)}: ${preview.members.map(displayName).join(", ")}`,
    });
    revalidateMeetings(meetingId);
    revalidatePath("/dues", "layout");
    const n = preview.members.length;
    return ok(`Created ${n} ${n === 1 ? "fine" : "fines"} of ${formatCents(preview.amountCents)} (due ${formatDate(dueDate)}).`);
  });
}

/** Issues a missed_meeting sanction for every absent member without one for this meeting. */
export async function issueAbsenceSanctions(meetingId: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("meetings.manage");
    const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
    if (!meeting) return fail("Not found.");
    if (!meeting.attendanceTaken) return fail("Take attendance first.");
    const preview = getSanctionPreview(meeting);
    if (preview.members.length === 0) return ok("Every absence for this meeting already has a sanction.");
    const dueAt = dateAtLocalTime(addDaysISO(todayISO(), 7), "23:59");
    db.transaction((tx) => {
      for (const m of preview.members) {
        tx.insert(sanctions)
          .values({ memberId: m.id, issuedById: user.id, reason: preview.reason, source: "missed_meeting", sourceRef: String(meetingId), issuedAt: nowISO(), dueAt, status: "open" })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: "attendance.sanction",
      entityType: "meeting",
      entityId: meetingId,
      summary: `${user.username} issued ${preview.members.length} sanction(s) for ${meetingLabel(meeting)}: ${preview.members.map(displayName).join(", ")}`,
    });
    revalidateMeetings(meetingId);
    revalidatePath("/sanctions", "layout");
    const n = preview.members.length;
    return ok(`Issued ${n} ${n === 1 ? "sanction" : "sanctions"} (due ${formatDate(addDaysISO(todayISO(), 7))}).`);
  });
}

/* ------------------------------------------------------------------ */
/* Excuse requests                                                      */
/* ------------------------------------------------------------------ */

const excuseSchema = z.object({
  meetingId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "Give a short reason.").max(1000, "Keep the reason under 1000 characters."),
});

export async function requestExcuse(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(excuseSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { meetingId, reason } = parsed.data;
    const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
    if (!meeting) return fail("Not found.");
    const existing = db
      .select()
      .from(excuseRequests)
      .where(and(eq(excuseRequests.memberId, user.id), eq(excuseRequests.meetingId, meetingId), inArray(excuseRequests.status, ["pending", "approved"])))
      .get();
    if (existing?.status === "pending") return fail("You already have a pending request for this meeting.");
    if (existing?.status === "approved") return fail("Your excuse for this meeting was already approved.");
    const row = db.insert(excuseRequests).values({ memberId: user.id, meetingId, reason }).returning({ id: excuseRequests.id }).get();
    logAudit({ actorId: user.id, action: "excuse.request", entityType: "excuse_request", entityId: row.id, summary: `${user.username} requested an excuse for ${meetingLabel(meeting)}` });
    revalidateMeetings(meetingId);
    return ok("Excuse requested. An officer will review it.", row.id);
  });
}

/** A member withdraws their own pending request. */
export async function withdrawExcuse(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const row = db.select().from(excuseRequests).where(eq(excuseRequests.id, id)).get();
    if (!row || row.memberId !== user.id) return fail("Not found.");
    if (row.status !== "pending") return fail("Only pending requests can be withdrawn.");
    db.delete(excuseRequests).where(eq(excuseRequests.id, id)).run();
    logAudit({ actorId: user.id, action: "excuse.withdraw", entityType: "excuse_request", entityId: id, summary: `${user.username} withdrew an excuse request` });
    revalidateMeetings(row.meetingId ?? undefined);
    return ok("Request withdrawn.");
  });
}

const reviewSchema = z.object({
  decision: z.enum(["approve", "deny"], { message: "Pick approve or deny." }),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

/** Approve or deny a pending request. Approving after attendance was taken marks that member excused. */
export async function reviewExcuse(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (!can(user, "meetings.manage")) return fail("You don't have permission to review excuse requests.");
    const parsed = parseForm(reviewSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { decision, note } = parsed.data;
    const row = db.select().from(excuseRequests).where(eq(excuseRequests.id, id)).get();
    if (!row || row.meetingId == null) return fail("Not found.");
    if (row.status !== "pending") return fail("This request was already reviewed.");
    const meeting = db.select().from(meetings).where(eq(meetings.id, row.meetingId)).get();
    if (!meeting) return fail("Not found.");
    const member = db.select().from(members).where(eq(members.id, row.memberId)).get();
    const status = decision === "approve" ? "approved" : "denied";
    const reviewedAt = nowISO();
    db.transaction((tx) => {
      tx.update(excuseRequests).set({ status, reviewedById: user.id, reviewedAt, reviewNote: note ?? null }).where(eq(excuseRequests.id, id)).run();
      if (status === "approved" && meeting.attendanceTaken) {
        tx.insert(attendance)
          .values({ meetingId: meeting.id, memberId: row.memberId, status: "excused", note: "Excuse approved", recordedById: user.id, recordedAt: reviewedAt })
          .onConflictDoUpdate({ target: [attendance.meetingId, attendance.memberId], set: { status: "excused", recordedById: user.id, recordedAt: reviewedAt } })
          .run();
      }
    });
    logAudit({
      actorId: user.id,
      action: `excuse.${status}`,
      entityType: "excuse_request",
      entityId: id,
      summary: `${user.username} ${status} ${member ? displayName(member) : "a member"}'s excuse for ${meetingLabel(meeting)}${note ? `: ${note}` : ""}`,
    });
    revalidateMeetings(meeting.id);
    revalidatePath("/members", "layout");
    return ok(status === "approved" ? "Excuse approved." : "Excuse denied.");
  });
}
