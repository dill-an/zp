/**
 * Seed the database from the Fall 2026 sheets.
 * Safe to re-run: exits if members already exist unless FORCE_SEED=1 (which wipes data first).
 */
import { sql } from "drizzle-orm";
import { db } from "./index";
import * as s from "./schema";
import { SEED_ATTENDANCE, SEED_MEETING_DATES_RECORDED, SEED_MEETING_DATES_UPCOMING, SEED_MEMBERS, SEED_PLEDGE_CLASSES } from "./seed-data/roster";
import { SEED_JOB_TYPES, SEED_WEEKS } from "./seed-data/cleans";
import { SEED_CHAIRS, SEED_TASKS } from "./seed-data/chairs";
import { hashPassword } from "../lib/password";
import { slugify } from "../lib/utils";
import { addDaysISO, dateAtLocalTime, todayISO } from "../lib/dates";
import { SETTING_DEFAULTS } from "../lib/settings-keys";

async function main() {
  const existing = db.select({ n: sql<number>`count(*)` }).from(s.members).get();
  if (existing && existing.n > 0) {
    if (process.env.FORCE_SEED !== "1") {
      console.log(`Database already has ${existing.n} members; skipping seed. Set FORCE_SEED=1 to wipe and reseed.`);
      return;
    }
    wipe();
  }

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? "zetapsi";
  const passwordHash = await hashPassword(defaultPassword);

  // Settings
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    db.insert(s.settings).values({ key, value }).onConflictDoNothing().run();
  }

  // Pledge classes
  const classIds = new Map<string, number>();
  for (const pc of SEED_PLEDGE_CLASSES) {
    const row = db
      .insert(s.pledgeClasses)
      .values({ name: pc.name, sortOrder: pc.sortOrder, semesterLabel: "semesterLabel" in pc ? pc.semesterLabel : null })
      .returning({ id: s.pledgeClasses.id })
      .get();
    classIds.set(pc.name, row.id);
  }

  // Members
  const memberIdByKey = new Map<string, number>(); // "First Last" -> id
  const memberIdByAlias = new Map<string, number>(); // preferred name / alias (lowercase) -> id
  const usernames = new Set<string>();
  for (const m of SEED_MEMBERS) {
    let username = `${slugify(m.first)}.${slugify(m.last)}`;
    let i = 2;
    while (usernames.has(username)) username = `${slugify(m.first)}.${slugify(m.last)}${i++}`;
    usernames.add(username);
    const preferred = m.preferred ?? m.first;
    const row = db
      .insert(s.members)
      .values({
        firstName: m.first,
        lastName: m.last,
        preferredName: preferred,
        username,
        passwordHash,
        mustChangePassword: process.env.SEED_SKIP_PASSWORD_CHANGE !== "1",
        role: m.role ?? "member",
        status: m.status ?? "active",
        laborGroup: m.laborGroup,
        pledgeClassId: m.pledgeClass ? (classIds.get(m.pledgeClass) ?? null) : null,
        notes: m.notes ?? null,
      })
      .returning({ id: s.members.id })
      .get();
    memberIdByKey.set(`${m.first} ${m.last}`, row.id);
    for (const alias of [preferred, ...(m.aliases ?? [])]) memberIdByAlias.set(alias.toLowerCase(), row.id);
  }
  // Only register bare first names as aliases when unambiguous within the labor pool.
  const firstCounts = new Map<string, number>();
  for (const m of SEED_MEMBERS) if (m.laborGroup !== "none") firstCounts.set(m.first.toLowerCase(), (firstCounts.get(m.first.toLowerCase()) ?? 0) + 1);
  for (const m of SEED_MEMBERS) {
    if (m.laborGroup === "none") continue;
    const key = m.first.toLowerCase();
    if (firstCounts.get(key) === 1 && !memberIdByAlias.has(key)) memberIdByAlias.set(key, memberIdByKey.get(`${m.first} ${m.last}`)!);
  }

  const adminId = memberIdByKey.get("Dylan Nguyen") ?? null;

  // Chairs
  const chairIdBySlug = new Map<string, number>();
  SEED_CHAIRS.forEach((c, idx) => {
    const row = db
      .insert(s.chairs)
      .values({
        slug: c.slug,
        name: c.name,
        category: c.category,
        isExec: c.isExec ?? false,
        description: c.description,
        responsibilities: c.responsibilities.map((r) => `- ${r}`).join("\n"),
        sortOrder: idx,
      })
      .returning({ id: s.chairs.id })
      .get();
    chairIdBySlug.set(c.slug, row.id);
  });

  // Starter tasks
  const today = todayISO();
  SEED_TASKS.forEach((t, idx) => {
    const chairId = chairIdBySlug.get(t.chair) ?? null;
    const dueAt = t.dueInDays == null ? null : dateAtLocalTime(addDaysISO(today, t.dueInDays), "23:59");
    const task = db
      .insert(s.tasks)
      .values({
        title: t.title,
        description: t.description ?? null,
        chairId,
        createdById: adminId,
        status: "todo",
        priority: t.priority ?? "normal",
        dueAt,
        recurrence: t.recurrence ?? "none",
        sortOrder: idx,
      })
      .returning({ id: s.tasks.id })
      .get();
    db.insert(s.taskActivity).values({ taskId: task.id, memberId: adminId, type: "created", body: "Task created from the starter checklist." }).run();
    (t.checklist ?? []).forEach((label, i) => {
      db.insert(s.taskChecklistItems).values({ taskId: task.id, label, sortOrder: i }).run();
    });
  });

  // Job types
  const jobIdByKey = new Map<string, number>();
  SEED_JOB_TYPES.forEach((j, idx) => {
    const row = db
      .insert(s.jobTypes)
      .values({
        name: j.name,
        kind: j.kind,
        category: j.category,
        windowLabel: j.windowLabel,
        startOffsetDays: j.startOffsetDays,
        dueOffsetDays: j.dueOffsetDays,
        slots: j.slots,
        points: j.points,
        instructions: j.instructions,
        isActive: j.isActive ?? true,
        sortOrder: idx,
      })
      .returning({ id: s.jobTypes.id })
      .get();
    jobIdByKey.set(j.key, row.id);
  });

  // Weekly clean assignments
  const unresolved: string[] = [];
  for (const [weekStart, jobs] of Object.entries(SEED_WEEKS)) {
    const week = db.insert(s.laborWeeks).values({ weekStart, isPublished: true, createdById: adminId }).returning({ id: s.laborWeeks.id }).get();
    for (const [jobKey, names] of Object.entries(jobs)) {
      const jobTypeId = jobIdByKey.get(jobKey);
      if (!jobTypeId) throw new Error(`Unknown job key ${jobKey}`);
      names.forEach((name, i) => {
        const memberId = memberIdByAlias.get(name.trim().toLowerCase());
        if (!memberId) {
          unresolved.push(`${weekStart} ${jobKey}: ${name}`);
          return;
        }
        db.insert(s.jobAssignments).values({ weekId: week.id, jobTypeId, memberId, slot: i + 1, status: "assigned" }).run();
      });
    }
  }
  if (unresolved.length) throw new Error(`Unresolved names in cleans seed:\n${unresolved.join("\n")}`);

  // House meetings and attendance
  const meetingTime = SETTING_DEFAULTS.house_meeting_time;
  const recordedIds: number[] = [];
  for (const date of SEED_MEETING_DATES_RECORDED) {
    const row = db
      .insert(s.meetings)
      .values({ title: "House Meeting", kind: "house", scheduledAt: dateAtLocalTime(date, meetingTime), location: "House", attendanceTaken: true, createdById: adminId })
      .returning({ id: s.meetings.id })
      .get();
    recordedIds.push(row.id);
  }
  for (const date of SEED_MEETING_DATES_UPCOMING) {
    db.insert(s.meetings)
      .values({ title: "House Meeting", kind: "house", scheduledAt: dateAtLocalTime(date, meetingTime), location: "House", attendanceTaken: false, createdById: adminId })
      .run();
  }
  const markToStatus = { P: "present", A: "absent", E: "excused" } as const;
  for (const [key, marks] of Object.entries(SEED_ATTENDANCE)) {
    const memberId = memberIdByKey.get(key);
    if (!memberId) throw new Error(`Attendance for unknown member ${key}`);
    marks.forEach((mark, i) => {
      if (mark === "-") return;
      db.insert(s.attendance)
        .values({ meetingId: recordedIds[i], memberId, status: markToStatus[mark], recordedById: adminId, recordedAt: dateAtLocalTime(SEED_MEETING_DATES_RECORDED[i], meetingTime) })
        .run();
    });
  }

  // Dues period placeholder (treasurer sets the amount, then bills members)
  db.insert(s.duesPeriods)
    .values({ name: "Fall 2026", amountCents: 0, dueDate: "2026-11-01", lateFeeCents: 2500, isActive: true, notes: "Set the dues amount, then use Bill members to create charges." })
    .run();

  // Welcome announcement
  db.insert(s.announcements)
    .values({
      title: "Welcome to the ZP House app",
      body: "This replaces the cleans spreadsheet and the attendance sheet. Check Dashboard for your cleans this week, Labor for the full grid, and Dues for your balance. Change your password under Settings.",
      authorId: adminId,
      audience: "all",
      isPinned: true,
    })
    .run();

  const counts = {
    members: SEED_MEMBERS.length,
    chairs: SEED_CHAIRS.length,
    tasks: SEED_TASKS.length,
    jobTypes: SEED_JOB_TYPES.length,
    weeks: Object.keys(SEED_WEEKS).length,
    meetings: SEED_MEETING_DATES_RECORDED.length + SEED_MEETING_DATES_UPCOMING.length,
  };
  console.log("Seeded:", counts);
  console.log(`Default password for every member: "${defaultPassword}" (must be changed on first login). Admin: dylan.nguyen`);
}

function wipe() {
  const tables = [
    s.auditLog, s.settings, s.maintenanceRequests, s.announcements, s.eventDuties, s.eventRsvps, s.events,
    s.excuseRequests, s.attendance, s.meetings, s.paymentPlans, s.payments, s.charges, s.duesPeriods, s.sanctions,
    s.jobSwapRequests, s.jobAssignments, s.laborWeeks, s.jobTypes, s.taskActivity, s.taskChecklistItems, s.taskAssignees,
    s.tasks, s.chairHolders, s.chairs, s.sessions, s.members, s.pledgeClasses,
  ];
  for (const t of tables) db.delete(t).run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
