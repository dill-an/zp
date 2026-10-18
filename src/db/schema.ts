/**
 * ZP House database schema (SQLite via Drizzle).
 *
 * Conventions
 * - IDs are integer autoincrement primary keys.
 * - Date-times are ISO 8601 strings (UTC) in `text` columns, e.g. "2026-10-18T14:00:00.000Z".
 * - Calendar dates (no time) are "YYYY-MM-DD" strings in `text` columns.
 * - Money is stored in integer cents.
 * - Booleans are `integer({ mode: "boolean" })`.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/* ------------------------------------------------------------------ */
/* Members, pledge classes, auth                                       */
/* ------------------------------------------------------------------ */

export const MEMBER_STATUSES = ["active", "new_member", "abroad", "inactive", "alumni"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_ROLES = ["admin", "officer", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const LABOR_GROUPS = ["cooks", "cleans", "none"] as const;
export type LaborGroup = (typeof LABOR_GROUPS)[number];

export const pledgeClasses = sqliteTable("pledge_classes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** Lower = older class. */
  sortOrder: integer("sort_order").notNull().default(0),
  semesterLabel: text("semester_label"),
  notes: text("notes"),
});

export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Short name used on the labor grid, e.g. "Gio", "David Coll". */
    preferredName: text("preferred_name").notNull(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
    role: text("role", { enum: MEMBER_ROLES }).notNull().default("member"),
    status: text("status", { enum: MEMBER_STATUSES }).notNull().default("active"),
    laborGroup: text("labor_group", { enum: LABOR_GROUPS }).notNull().default("none"),
    pledgeClassId: integer("pledge_class_id").references(() => pledgeClasses.id, { onDelete: "set null" }),
    email: text("email"),
    phone: text("phone"),
    room: text("room"),
    livesInHouse: integer("lives_in_house", { mode: "boolean" }).notNull().default(true),
    major: text("major"),
    gradYear: integer("grad_year"),
    birthday: text("birthday"),
    emergencyContact: text("emergency_contact"),
    dietaryNotes: text("dietary_notes"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("members_last_name_idx").on(t.lastName), index("members_status_idx").on(t.status)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** Random opaque token (hashed before storage). */
    id: text("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(now),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_member_idx").on(t.memberId)],
);

/* ------------------------------------------------------------------ */
/* Chairs (officer positions) and tasks                                */
/* ------------------------------------------------------------------ */

export const CHAIR_CATEGORIES = ["exec", "house", "social", "internal", "external"] as const;
export type ChairCategory = (typeof CHAIR_CATEGORIES)[number];

export const chairs = sqliteTable("chairs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category", { enum: CHAIR_CATEGORIES }).notNull().default("internal"),
  description: text("description"),
  /** Markdown-ish bullet list of standing responsibilities. */
  responsibilities: text("responsibilities"),
  isExec: integer("is_exec", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

export const chairHolders = sqliteTable(
  "chair_holders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chairId: integer("chair_id")
      .notNull()
      .references(() => chairs.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    termStart: text("term_start").notNull(),
    /** Null = current holder. */
    termEnd: text("term_end"),
    title: text("title"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("chair_holders_chair_idx").on(t.chairId), index("chair_holders_member_idx").on(t.memberId)],
);

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_RECURRENCES = ["none", "weekly", "biweekly", "monthly"] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description"),
    chairId: integer("chair_id").references(() => chairs.id, { onDelete: "set null" }),
    createdById: integer("created_by_id").references(() => members.id, { onDelete: "set null" }),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("normal"),
    dueAt: text("due_at"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    completedById: integer("completed_by_id").references(() => members.id, { onDelete: "set null" }),
    recurrence: text("recurrence", { enum: TASK_RECURRENCES }).notNull().default("none"),
    tags: text("tags"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("tasks_chair_idx").on(t.chairId), index("tasks_status_idx").on(t.status), index("tasks_due_idx").on(t.dueAt)],
);

export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    assignedAt: text("assigned_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.memberId] }), index("task_assignees_member_idx").on(t.memberId)],
);

export const taskChecklistItems = sqliteTable("task_checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  isDone: integer("is_done", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const TASK_ACTIVITY_TYPES = ["comment", "status", "assignment", "edit", "created"] as const;
export const taskActivity = sqliteTable(
  "task_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    type: text("type", { enum: TASK_ACTIVITY_TYPES }).notNull().default("comment"),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId)],
);

/* ------------------------------------------------------------------ */
/* Labor: job types (cleans, cook shifts, duties) and weekly assignments */
/* ------------------------------------------------------------------ */

export const JOB_KINDS = ["clean", "cook", "duty"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const JOB_CATEGORIES = ["commons", "bathroom", "kitchen", "meal", "trash", "yard", "other"] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const jobTypes = sqliteTable("job_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: JOB_KINDS }).notNull().default("clean"),
  category: text("category", { enum: JOB_CATEGORIES }).notNull().default("other"),
  /** Human label for the window, e.g. "Mon-Wed", "Sun". */
  windowLabel: text("window_label"),
  /** Days after the week's Sunday on which the job may start (0 = that Sunday). */
  startOffsetDays: integer("start_offset_days").notNull().default(0),
  /** Days after the week's Sunday by which the job is due (7 = the following Sunday). */
  dueOffsetDays: integer("due_offset_days").notNull().default(7),
  /** Number of people needed each week. */
  slots: integer("slots").notNull().default(1),
  /** Labor points awarded; used for fairness stats. */
  points: integer("points").notNull().default(1),
  instructions: text("instructions"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

export const laborWeeks = sqliteTable("labor_weeks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The Sunday that starts the week, "YYYY-MM-DD". */
  weekStart: text("week_start").notNull().unique(),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => members.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().default(now),
});

export const ASSIGNMENT_STATUSES = ["assigned", "done", "missed", "excused", "swapped"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const jobAssignments = sqliteTable(
  "job_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekId: integer("week_id")
      .notNull()
      .references(() => laborWeeks.id, { onDelete: "cascade" }),
    jobTypeId: integer("job_type_id")
      .notNull()
      .references(() => jobTypes.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** 1-based slot within the job for that week. */
    slot: integer("slot").notNull().default(1),
    status: text("status", { enum: ASSIGNMENT_STATUSES }).notNull().default("assigned"),
    completedAt: text("completed_at"),
    verifiedById: integer("verified_by_id").references(() => members.id, { onDelete: "set null" }),
    verifiedAt: text("verified_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("job_assignments_week_job_slot_uq").on(t.weekId, t.jobTypeId, t.slot),
    index("job_assignments_member_idx").on(t.memberId),
    index("job_assignments_week_idx").on(t.weekId),
  ],
);

export const SWAP_STATUSES = ["pending", "accepted", "declined", "approved", "cancelled"] as const;
export const jobSwapRequests = sqliteTable("job_swap_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assignmentId: integer("assignment_id")
    .notNull()
    .references(() => jobAssignments.id, { onDelete: "cascade" }),
  requestedById: integer("requested_by_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  /** Brother asked to take the job (null = open request). */
  targetMemberId: integer("target_member_id").references(() => members.id, { onDelete: "set null" }),
  reason: text("reason"),
  status: text("status", { enum: SWAP_STATUSES }).notNull().default("pending"),
  resolvedById: integer("resolved_by_id").references(() => members.id, { onDelete: "set null" }),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* Sanctions (punishment jobs, fines, work hours)                       */
/* ------------------------------------------------------------------ */

export const SANCTION_STATUSES = ["open", "in_progress", "completed", "verified", "waived", "appealed"] as const;
export type SanctionStatus = (typeof SANCTION_STATUSES)[number];
export const SANCTION_SOURCES = ["manual", "missed_clean", "missed_meeting", "late_dues", "conduct", "other"] as const;

export const sanctions = sqliteTable(
  "sanctions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    issuedById: integer("issued_by_id").references(() => members.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    /** What they actually have to do, e.g. "Deep clean basement bathroom". */
    jobDescription: text("job_description"),
    hours: integer("hours"),
    fineCents: integer("fine_cents"),
    source: text("source", { enum: SANCTION_SOURCES }).notNull().default("manual"),
    /** Optional pointer to the thing that triggered it (assignment id, attendance id). */
    sourceRef: text("source_ref"),
    issuedAt: text("issued_at").notNull().default(now),
    dueAt: text("due_at"),
    status: text("status", { enum: SANCTION_STATUSES }).notNull().default("open"),
    completedAt: text("completed_at"),
    verifiedById: integer("verified_by_id").references(() => members.id, { onDelete: "set null" }),
    verifiedAt: text("verified_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("sanctions_member_idx").on(t.memberId), index("sanctions_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ */
/* Dues and finance ledger                                             */
/* ------------------------------------------------------------------ */

export const duesPeriods = sqliteTable("dues_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** Standard amount charged to each active member. */
  amountCents: integer("amount_cents").notNull().default(0),
  /** Amount charged to new members / pledges (null = same as amountCents). */
  newMemberAmountCents: integer("new_member_amount_cents"),
  dueDate: text("due_date").notNull(),
  lateFeeCents: integer("late_fee_cents").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

export const CHARGE_KINDS = ["dues", "fine", "late_fee", "social", "damage", "other", "credit", "adjustment"] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

/** Positive amounts are owed by the member; negative amounts are credits. */
export const charges = sqliteTable(
  "charges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    periodId: integer("period_id").references(() => duesPeriods.id, { onDelete: "set null" }),
    kind: text("kind", { enum: CHARGE_KINDS }).notNull().default("dues"),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueDate: text("due_date"),
    sanctionId: integer("sanction_id").references(() => sanctions.id, { onDelete: "set null" }),
    createdById: integer("created_by_id").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("charges_member_idx").on(t.memberId), index("charges_period_idx").on(t.periodId)],
);

export const PAYMENT_METHODS = ["venmo", "zelle", "cash", "check", "card", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    periodId: integer("period_id").references(() => duesPeriods.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull().default("venmo"),
    reference: text("reference"),
    paidAt: text("paid_at").notNull(),
    recordedById: integer("recorded_by_id").references(() => members.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("payments_member_idx").on(t.memberId), index("payments_period_idx").on(t.periodId)],
);

export const PLAN_STATUSES = ["proposed", "approved", "completed", "defaulted", "cancelled"] as const;
export const paymentPlans = sqliteTable("payment_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  periodId: integer("period_id").references(() => duesPeriods.id, { onDelete: "set null" }),
  /** JSON array of { dueDate: "YYYY-MM-DD", amountCents: number }. */
  installmentsJson: text("installments_json").notNull(),
  status: text("status", { enum: PLAN_STATUSES }).notNull().default("proposed"),
  approvedById: integer("approved_by_id").references(() => members.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* Meetings, attendance, excuse requests                               */
/* ------------------------------------------------------------------ */

export const MEETING_KINDS = ["house", "chapter", "exec", "new_member", "committee", "other"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const meetings = sqliteTable(
  "meetings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    kind: text("kind", { enum: MEETING_KINDS }).notNull().default("house"),
    scheduledAt: text("scheduled_at").notNull(),
    location: text("location"),
    agenda: text("agenda"),
    minutes: text("minutes"),
    isMandatory: integer("is_mandatory", { mode: "boolean" }).notNull().default(true),
    attendanceTaken: integer("attendance_taken", { mode: "boolean" }).notNull().default(false),
    createdById: integer("created_by_id").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("meetings_scheduled_idx").on(t.scheduledAt)],
);

export const ATTENDANCE_STATUSES = ["present", "absent", "excused", "late"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendance = sqliteTable(
  "attendance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    meetingId: integer("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: text("status", { enum: ATTENDANCE_STATUSES }).notNull().default("absent"),
    note: text("note"),
    recordedById: integer("recorded_by_id").references(() => members.id, { onDelete: "set null" }),
    recordedAt: text("recorded_at").notNull().default(now),
  },
  (t) => [uniqueIndex("attendance_meeting_member_uq").on(t.meetingId, t.memberId), index("attendance_member_idx").on(t.memberId)],
);

export const EXCUSE_STATUSES = ["pending", "approved", "denied"] as const;
export const excuseRequests = sqliteTable("excuse_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  meetingId: integer("meeting_id").references(() => meetings.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id").references(() => jobAssignments.id, { onDelete: "cascade" }),
  eventId: integer("event_id"),
  reason: text("reason").notNull(),
  status: text("status", { enum: EXCUSE_STATUSES }).notNull().default("pending"),
  reviewedById: integer("reviewed_by_id").references(() => members.id, { onDelete: "set null" }),
  reviewedAt: text("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: text("created_at").notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* Events, RSVPs, event duties                                         */
/* ------------------------------------------------------------------ */

export const EVENT_KINDS = ["social", "rush", "philanthropy", "brotherhood", "alumni", "chapter", "athletics", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    kind: text("kind", { enum: EVENT_KINDS }).notNull().default("other"),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    location: text("location"),
    description: text("description"),
    chairId: integer("chair_id").references(() => chairs.id, { onDelete: "set null" }),
    createdById: integer("created_by_id").references(() => members.id, { onDelete: "set null" }),
    isMandatory: integer("is_mandatory", { mode: "boolean" }).notNull().default(false),
    rsvpEnabled: integer("rsvp_enabled", { mode: "boolean" }).notNull().default(true),
    budgetCents: integer("budget_cents"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("events_starts_idx").on(t.startsAt)],
);

export const RSVP_STATUSES = ["going", "maybe", "not_going"] as const;
export const eventRsvps = sqliteTable(
  "event_rsvps",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    status: text("status", { enum: RSVP_STATUSES }).notNull().default("going"),
    guests: integer("guests").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] })],
);

export const EVENT_DUTY_KINDS = ["sober_monitor", "setup", "cleanup", "door", "driver", "other"] as const;
export const eventDuties = sqliteTable(
  "event_duties",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
    duty: text("duty", { enum: EVENT_DUTY_KINDS }).notNull().default("other"),
    label: text("label"),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    status: text("status", { enum: ASSIGNMENT_STATUSES }).notNull().default("assigned"),
    completedAt: text("completed_at"),
    notes: text("notes"),
  },
  (t) => [index("event_duties_event_idx").on(t.eventId), index("event_duties_member_idx").on(t.memberId)],
);

/* ------------------------------------------------------------------ */
/* Announcements, maintenance, audit log, settings                     */
/* ------------------------------------------------------------------ */

export const ANNOUNCEMENT_AUDIENCES = ["all", "officers", "new_members", "live_in"] as const;
export const announcements = sqliteTable("announcements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorId: integer("author_id").references(() => members.id, { onDelete: "set null" }),
  audience: text("audience", { enum: ANNOUNCEMENT_AUDIENCES }).notNull().default("all"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const MAINTENANCE_STATUSES = ["open", "in_progress", "resolved", "wont_fix"] as const;
export const MAINTENANCE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const maintenanceRequests = sqliteTable("maintenance_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  priority: text("priority", { enum: MAINTENANCE_PRIORITIES }).notNull().default("normal"),
  status: text("status", { enum: MAINTENANCE_STATUSES }).notNull().default("open"),
  reportedById: integer("reported_by_id").references(() => members.id, { onDelete: "set null" }),
  assignedToId: integer("assigned_to_id").references(() => members.id, { onDelete: "set null" }),
  resolvedAt: text("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: integer("actor_id").references(() => members.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type PledgeClass = typeof pledgeClasses.$inferSelect;
export type Chair = typeof chairs.$inferSelect;
export type ChairHolder = typeof chairHolders.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskActivityRow = typeof taskActivity.$inferSelect;
export type JobType = typeof jobTypes.$inferSelect;
export type LaborWeek = typeof laborWeeks.$inferSelect;
export type JobAssignment = typeof jobAssignments.$inferSelect;
export type JobSwapRequest = typeof jobSwapRequests.$inferSelect;
export type Sanction = typeof sanctions.$inferSelect;
export type DuesPeriod = typeof duesPeriods.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type AttendanceRow = typeof attendance.$inferSelect;
export type ExcuseRequest = typeof excuseRequests.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type EventDuty = typeof eventDuties.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
