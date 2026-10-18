"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  ANNOUNCEMENT_AUDIENCES,
  EVENT_DUTY_KINDS,
  EVENT_KINDS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  RSVP_STATUSES,
  announcements,
  chairs,
  eventDuties,
  eventRsvps,
  events,
  maintenanceRequests,
  members,
  type Announcement,
  type MaintenanceRequest,
} from "@/db/schema";
import { fail, formValues, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth";
import { can, type CurrentUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { localInputToISO, nowISO } from "@/lib/dates";
import { parseDollarsToCents } from "@/lib/money";
import { announcementVisible, isResolvedStatus, type MaintenanceStatus } from "@/lib/queries/community-logic";

/** Checkbox inputs arrive as "on" (or nothing at all). */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

const optionalText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).optional();

/** A failure that points at one field and keeps what was typed. */
function fieldFail(formData: FormData, field: string, message: string): ActionResult {
  return fail(message, { [field]: [message] }, formValues(formData));
}

function revalidateEvents(id?: number) {
  revalidatePath("/events");
  revalidatePath("/events/calendar");
  if (id != null) revalidatePath(`/events/${id}`);
  revalidatePath("/dashboard");
}

function revalidateAnnouncements() {
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

function revalidateMaintenance(id?: number) {
  revalidatePath("/maintenance");
  if (id != null) revalidatePath(`/maintenance/${id}`);
  revalidatePath("/dashboard");
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

const eventSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200, "Keep the title under 200 characters."),
  kind: z.enum(EVENT_KINDS, { message: "Pick a kind." }),
  startsAt: z.string().min(1, "Pick a start time."),
  endsAt: z.string().optional(),
  location: optionalText(200),
  description: optionalText(5000),
  chairId: z.coerce.number().int().positive().optional(),
  isMandatory: checkbox,
  rsvpEnabled: checkbox,
  budget: optionalText(20),
});

type EventValues = {
  title: string;
  kind: (typeof EVENT_KINDS)[number];
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  description: string | null;
  chairId: number | null;
  isMandatory: boolean;
  rsvpEnabled: boolean;
  budgetCents: number | null;
};

/** Validate the event form into column values, or return the failure to show. */
function parseEventForm(formData: FormData): { values: EventValues } | { result: ActionResult } {
  const parsed = parseForm(eventSchema, formData);
  if ("result" in parsed) return parsed;
  const d = parsed.data;
  const startsAt = localInputToISO(d.startsAt);
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return { result: fieldFail(formData, "startsAt", "Start time is invalid.") };
  const endsAt = d.endsAt ? localInputToISO(d.endsAt) : null;
  if (d.endsAt && (!endsAt || Number.isNaN(Date.parse(endsAt)))) return { result: fieldFail(formData, "endsAt", "End time is invalid.") };
  if (endsAt && endsAt < startsAt) return { result: fieldFail(formData, "endsAt", "The end must be after the start.") };
  let budgetCents: number | null = null;
  if (d.budget) {
    budgetCents = parseDollarsToCents(d.budget);
    if (budgetCents == null || budgetCents < 0) return { result: fieldFail(formData, "budget", "Enter a dollar amount like 250 or 99.50.") };
  }
  if (d.chairId != null && !db.select({ id: chairs.id }).from(chairs).where(eq(chairs.id, d.chairId)).get()) {
    return { result: fieldFail(formData, "chairId", "That chair does not exist.") };
  }
  return {
    values: {
      title: d.title,
      kind: d.kind,
      startsAt,
      endsAt,
      location: d.location || null,
      description: d.description || null,
      chairId: d.chairId ?? null,
      isMandatory: d.isMandatory,
      rsvpEnabled: d.rsvpEnabled,
      budgetCents,
    },
  };
}

export async function createEvent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let newId: number | null = null;
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("events.manage");
    const parsed = parseEventForm(formData);
    if ("result" in parsed) return parsed.result;
    const row = db
      .insert(events)
      .values({ ...parsed.values, createdById: user.id })
      .returning({ id: events.id })
      .get();
    newId = row.id;
    logAudit({ actorId: user.id, action: "event.create", entityType: "event", entityId: row.id, summary: `${user.username} created event "${parsed.values.title}"` });
    revalidateEvents(row.id);
    return ok("Event created.", row.id);
  });
  if (result.ok && newId != null) redirect(`/events/${newId}`);
  return result;
}

export async function updateEvent(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("events.manage");
    const existing = db.select().from(events).where(eq(events.id, id)).get();
    if (!existing) return fail("Not found.");
    const parsed = parseEventForm(formData);
    if ("result" in parsed) return parsed.result;
    db.update(events).set(parsed.values).where(eq(events.id, id)).run();
    logAudit({ actorId: user.id, action: "event.update", entityType: "event", entityId: id, summary: `${user.username} edited event "${parsed.values.title}"` });
    revalidateEvents(id);
    return ok("Event saved.", id);
  });
  if (result.ok) redirect(`/events/${id}`);
  return result;
}

export async function deleteEvent(id: number): Promise<ActionResult> {
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("events.manage");
    const existing = db.select().from(events).where(eq(events.id, id)).get();
    if (!existing) return fail("Not found.");
    db.delete(events).where(eq(events.id, id)).run();
    logAudit({ actorId: user.id, action: "event.delete", entityType: "event", entityId: id, summary: `${user.username} deleted event "${existing.title}"` });
    revalidateEvents(id);
    return ok("Event deleted.");
  });
  if (result.ok) redirect("/events");
  return result;
}

const rsvpSchema = z.object({
  status: z.enum(RSVP_STATUSES, { message: "Pick going, maybe or not going." }),
  guests: z.coerce.number().int("Guests must be a whole number.").min(0, "Guests cannot be negative.").max(20, "That is a lot of guests. Talk to the chair.").default(0),
});

/** Anyone can RSVP to an event that has RSVPs enabled. The submit button carries the status. */
export async function setRsvp(eventId: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const event = db.select().from(events).where(eq(events.id, eventId)).get();
    if (!event) return fail("Not found.");
    if (!event.rsvpEnabled) return fail("RSVPs are closed for this event.");
    const parsed = parseForm(rsvpSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { status, guests } = parsed.data;
    const now = nowISO();
    db.insert(eventRsvps)
      .values({ eventId, memberId: user.id, status, guests: status === "going" ? guests : 0, updatedAt: now })
      .onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.memberId], set: { status, guests: status === "going" ? guests : 0, updatedAt: now } })
      .run();
    logAudit({ actorId: user.id, action: "event.rsvp", entityType: "event", entityId: eventId, summary: `${user.username} RSVP'd ${status.replace("_", " ")} to "${event.title}"` });
    revalidateEvents(eventId);
    return ok(status === "going" ? "You're going." : status === "maybe" ? "Marked as maybe." : "Marked as not going.");
  });
}

const dutySchema = z.object({
  memberId: z.coerce.number().int().positive().optional(),
  duty: z.enum(EVENT_DUTY_KINDS, { message: "Pick a duty." }),
  label: optionalText(200),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export async function addEventDuty(eventId: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("events.manage");
    const event = db.select().from(events).where(eq(events.id, eventId)).get();
    if (!event) return fail("Not found.");
    const parsed = parseForm(dutySchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    if (d.memberId != null && !db.select({ id: members.id }).from(members).where(eq(members.id, d.memberId)).get()) {
      return fieldFail(formData, "memberId", "That brother does not exist.");
    }
    const startsAt = d.startsAt ? localInputToISO(d.startsAt) : null;
    const endsAt = d.endsAt ? localInputToISO(d.endsAt) : null;
    if (d.startsAt && !startsAt) return fieldFail(formData, "startsAt", "Start time is invalid.");
    if (d.endsAt && !endsAt) return fieldFail(formData, "endsAt", "End time is invalid.");
    if (startsAt && endsAt && endsAt < startsAt) return fieldFail(formData, "endsAt", "The end must be after the start.");
    const row = db
      .insert(eventDuties)
      .values({ eventId, memberId: d.memberId ?? null, duty: d.duty, label: d.label || null, startsAt, endsAt, status: "assigned" })
      .returning({ id: eventDuties.id })
      .get();
    logAudit({
      actorId: user.id,
      action: "event.duty.add",
      entityType: "event_duty",
      entityId: row.id,
      summary: `${user.username} added a ${d.duty.replace("_", " ")} duty to "${event.title}"`,
    });
    revalidateEvents(eventId);
    return ok("Duty added.", row.id);
  });
}

export async function removeEventDuty(dutyId: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("events.manage");
    const duty = db.select().from(eventDuties).where(eq(eventDuties.id, dutyId)).get();
    if (!duty) return fail("Not found.");
    db.delete(eventDuties).where(eq(eventDuties.id, dutyId)).run();
    logAudit({ actorId: user.id, action: "event.duty.remove", entityType: "event_duty", entityId: dutyId, summary: `${user.username} removed a ${duty.duty.replace("_", " ")} duty` });
    revalidateEvents(duty.eventId);
    return ok("Duty removed.");
  });
}

const DUTY_STATUSES = ["assigned", "done", "missed"] as const;
export type DutyStatus = (typeof DUTY_STATUSES)[number];

/** Managers set any status; the assigned brother can only mark their own still-assigned duty done. */
export async function setDutyStatus(dutyId: number, status: DutyStatus): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (!DUTY_STATUSES.includes(status)) return fail("Unknown status.");
    const duty = db.select().from(eventDuties).where(eq(eventDuties.id, dutyId)).get();
    if (!duty) return fail("Not found.");
    const manager = can(user, "events.manage");
    const own = duty.memberId === user.id;
    if (!manager) {
      if (!own || status !== "done") return fail("You can only mark your own duty as done.");
      // A verdict (missed) or an earlier done stays until an officer reopens the duty.
      if (duty.status !== "assigned") return fail("Only an officer can change a duty that was marked missed or done.");
    }
    db.update(eventDuties)
      .set({ status, completedAt: status === "done" ? nowISO() : null })
      .where(eq(eventDuties.id, dutyId))
      .run();
    logAudit({ actorId: user.id, action: "event.duty.status", entityType: "event_duty", entityId: dutyId, summary: `${user.username} marked a ${duty.duty.replace("_", " ")} duty ${status}` });
    revalidateEvents(duty.eventId);
    return ok(status === "done" ? "Marked done." : status === "missed" ? "Marked missed." : "Reopened.");
  });
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

const announcementSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200, "Keep the title under 200 characters."),
  body: z.string().trim().min(1, "Write the announcement.").max(10000, "Keep it under 10,000 characters."),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES, { message: "Pick an audience." }),
  isPinned: checkbox,
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.").optional(),
});

/** Authors edit their own posts; admins edit any. */
function canEditAnnouncement(user: CurrentUser, a: Announcement): boolean {
  return user.role === "admin" || a.authorId === user.id;
}

export async function createAnnouncement(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let landing = "/announcements";
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("announcements.post");
    const parsed = parseForm(announcementSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const row = db
      .insert(announcements)
      .values({ title: d.title, body: d.body, audience: d.audience, isPinned: d.isPinned, expiresAt: d.expiresAt ?? null, authorId: user.id })
      .returning({ id: announcements.id })
      .get();
    logAudit({ actorId: user.id, action: "announcement.create", entityType: "announcement", entityId: row.id, summary: `${user.username} posted "${d.title}" to ${d.audience}` });
    revalidateAnnouncements();
    landing = announcementLanding(user, d);
    return ok("Announcement posted.", row.id);
  });
  if (result.ok) redirect(landing);
  return result;
}

/**
 * Where to send a poster after saving: the "For me" list when the post shows there, otherwise "All posts",
 * so a post to another audience (or one that already expired) does not look like it vanished.
 */
function announcementLanding(user: CurrentUser, a: { audience: Announcement["audience"]; expiresAt?: string | null }): string {
  return announcementVisible({ audience: a.audience, expiresAt: a.expiresAt ?? null }, user) ? "/announcements" : "/announcements?all=1";
}

export async function updateAnnouncement(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let landing = "/announcements";
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("announcements.post");
    const existing = db.select().from(announcements).where(eq(announcements.id, id)).get();
    if (!existing) return fail("Not found.");
    if (!canEditAnnouncement(user, existing)) return fail("You can only edit your own announcements.");
    const parsed = parseForm(announcementSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    db.update(announcements)
      .set({ title: d.title, body: d.body, audience: d.audience, isPinned: d.isPinned, expiresAt: d.expiresAt ?? null, updatedAt: nowISO() })
      .where(eq(announcements.id, id))
      .run();
    logAudit({ actorId: user.id, action: "announcement.update", entityType: "announcement", entityId: id, summary: `${user.username} edited announcement "${d.title}"` });
    revalidateAnnouncements();
    landing = announcementLanding(user, d);
    return ok("Announcement saved.", id);
  });
  if (result.ok) redirect(landing);
  return result;
}

export async function deleteAnnouncement(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("announcements.post");
    const existing = db.select().from(announcements).where(eq(announcements.id, id)).get();
    if (!existing) return fail("Not found.");
    if (!canEditAnnouncement(user, existing)) return fail("You can only delete your own announcements.");
    db.delete(announcements).where(eq(announcements.id, id)).run();
    logAudit({ actorId: user.id, action: "announcement.delete", entityType: "announcement", entityId: id, summary: `${user.username} deleted announcement "${existing.title}"` });
    revalidateAnnouncements();
    return ok("Announcement deleted.");
  });
}

/** Pin or unpin. Takes the target state (not a toggle) so a double submit cannot undo itself. */
export async function setAnnouncementPinned(id: number, isPinned: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("announcements.post");
    const existing = db.select().from(announcements).where(eq(announcements.id, id)).get();
    if (!existing) return fail("Not found.");
    if (!canEditAnnouncement(user, existing)) return fail("Only the author or an admin can pin this.");
    if (existing.isPinned === isPinned) return ok(isPinned ? "Pinned." : "Unpinned.");
    db.update(announcements).set({ isPinned, updatedAt: nowISO() }).where(eq(announcements.id, id)).run();
    logAudit({ actorId: user.id, action: isPinned ? "announcement.pin" : "announcement.unpin", entityType: "announcement", entityId: id, summary: `${user.username} ${isPinned ? "pinned" : "unpinned"} "${existing.title}"` });
    revalidateAnnouncements();
    return ok(isPinned ? "Pinned." : "Unpinned.");
  });
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

const maintenanceSchema = z.object({
  title: z.string().trim().min(1, "Say what is broken in a few words.").max(200, "Keep the title under 200 characters."),
  description: optionalText(5000),
  location: optionalText(200),
  priority: z.enum(MAINTENANCE_PRIORITIES, { message: "Pick a priority." }),
});

export async function createMaintenanceRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let newId: number | null = null;
  const result = await runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(maintenanceSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    const row = db
      .insert(maintenanceRequests)
      .values({ title: d.title, description: d.description || null, location: d.location || null, priority: d.priority, status: "open", reportedById: user.id })
      .returning({ id: maintenanceRequests.id })
      .get();
    newId = row.id;
    logAudit({ actorId: user.id, action: "maintenance.create", entityType: "maintenance_request", entityId: row.id, summary: `${user.username} reported "${d.title}"` });
    revalidateMaintenance(row.id);
    return ok("Issue reported.", row.id);
  });
  if (result.ok && newId != null) redirect(`/maintenance/${newId}`);
  return result;
}

/** The reporter can edit while the request is open; managers can always edit. */
function canEditMaintenance(user: CurrentUser, r: MaintenanceRequest): boolean {
  if (can(user, "maintenance.manage")) return true;
  return r.reportedById === user.id && r.status === "open";
}

export async function updateMaintenanceRequest(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const existing = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get();
    if (!existing) return fail("Not found.");
    if (!canEditMaintenance(user, existing)) return fail("Only the reporter (while it is open) or the house manager can edit this.");
    const parsed = parseForm(maintenanceSchema, formData);
    if ("result" in parsed) return parsed.result;
    const d = parsed.data;
    db.update(maintenanceRequests)
      .set({ title: d.title, description: d.description || null, location: d.location || null, priority: d.priority, updatedAt: nowISO() })
      .where(eq(maintenanceRequests.id, id))
      .run();
    logAudit({ actorId: user.id, action: "maintenance.update", entityType: "maintenance_request", entityId: id, summary: `${user.username} edited request "${d.title}"` });
    revalidateMaintenance(id);
    return ok("Saved.", id);
  });
}

const assignSchema = z.object({ assignedToId: z.coerce.number().int().positive().optional() });

export async function assignMaintenance(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("maintenance.manage");
    const existing = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get();
    if (!existing) return fail("Not found.");
    const parsed = parseForm(assignSchema, formData);
    if ("result" in parsed) return parsed.result;
    const assignedToId = parsed.data.assignedToId ?? null;
    let assignee: { username: string } | undefined;
    if (assignedToId != null) {
      assignee = db.select({ username: members.username }).from(members).where(eq(members.id, assignedToId)).get();
      if (!assignee) return fieldFail(formData, "assignedToId", "That brother does not exist.");
    }
    db.update(maintenanceRequests).set({ assignedToId, updatedAt: nowISO() }).where(eq(maintenanceRequests.id, id)).run();
    logAudit({
      actorId: user.id,
      action: "maintenance.assign",
      entityType: "maintenance_request",
      entityId: id,
      summary: assignee ? `${user.username} assigned "${existing.title}" to ${assignee.username}` : `${user.username} unassigned "${existing.title}"`,
    });
    revalidateMaintenance(id);
    return ok(assignee ? "Assigned." : "Unassigned.");
  });
}

const ASSIGNEE_STATUSES: MaintenanceStatus[] = ["in_progress", "resolved"];

/**
 * Change a request's status. Managers may set any status and add resolution notes;
 * the assignee may move their own request to in progress or resolved.
 * `resolvedAt` is set when the request becomes resolved or won't fix and cleared when it reopens.
 */
export async function setMaintenanceStatus(id: number, status: MaintenanceStatus, resolutionNotes?: string | null): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (!MAINTENANCE_STATUSES.includes(status)) return fail("Unknown status.");
    const existing = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get();
    if (!existing) return fail("Not found.");
    const manager = can(user, "maintenance.manage");
    const assignee = existing.assignedToId === user.id;
    if (!manager && !(assignee && ASSIGNEE_STATUSES.includes(status))) return fail("Only the house manager or the assignee can change the status.");
    const now = nowISO();
    const resolved = isResolvedStatus(status);
    const notes = resolutionNotes === undefined ? undefined : resolutionNotes?.trim() || null;
    db.update(maintenanceRequests)
      .set({
        status,
        resolvedAt: resolved ? (existing.resolvedAt && isResolvedStatus(existing.status) ? existing.resolvedAt : now) : null,
        ...(notes !== undefined && (manager || notes) ? { resolutionNotes: notes } : {}),
        updatedAt: now,
      })
      .where(eq(maintenanceRequests.id, id))
      .run();
    logAudit({
      actorId: user.id,
      action: "maintenance.status",
      entityType: "maintenance_request",
      entityId: id,
      summary: `${user.username} marked "${existing.title}" ${status.replace("_", " ")}`,
    });
    revalidateMaintenance(id);
    return ok(`Marked ${status.replace("_", " ")}.`);
  });
}

const statusFormSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES, { message: "Pick a status." }),
  resolutionNotes: optionalText(5000),
});

/** Form flavour of setMaintenanceStatus (status select plus resolution notes). */
export async function changeMaintenanceStatus(id: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(statusFormSchema, formData);
  if ("result" in parsed) return parsed.result;
  // Only a form that carries the notes field may change the notes (the list card's form has none);
  // an emptied field still clears them.
  const notes = formData.has("resolutionNotes") ? (parsed.data.resolutionNotes ?? "") : undefined;
  return setMaintenanceStatus(id, parsed.data.status, notes);
}

export async function deleteMaintenanceRequest(id: number): Promise<ActionResult> {
  const result = await runAction(async () => {
    const user = await requirePermissionForAction("maintenance.manage");
    const existing = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get();
    if (!existing) return fail("Not found.");
    db.delete(maintenanceRequests).where(eq(maintenanceRequests.id, id)).run();
    logAudit({ actorId: user.id, action: "maintenance.delete", entityType: "maintenance_request", entityId: id, summary: `${user.username} deleted request "${existing.title}"` });
    revalidateMaintenance(id);
    return ok("Request deleted.");
  });
  if (result.ok) redirect("/maintenance");
  return result;
}
