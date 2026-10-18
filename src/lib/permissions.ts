/**
 * Permission model.
 *
 * - `admin` role bypasses every check.
 * - Chairs grant module permissions (e.g. the treasurer manages dues).
 * - Everyone can read most things and act on items assigned to them.
 */
import type { Member } from "@/db/schema";

export const PERMISSIONS = [
  "members.manage",
  "chairs.manage",
  "tasks.manage_all",
  "labor.manage",
  "sanctions.manage",
  "dues.manage",
  "meetings.manage",
  "events.manage",
  "announcements.post",
  "maintenance.manage",
  "settings.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Chair slug -> permissions that chair grants. Slugs match `src/db/seed-data/chairs.ts`. */
export const CHAIR_PERMISSIONS: Record<string, Permission[]> = {
  president: [
    "members.manage",
    "chairs.manage",
    "tasks.manage_all",
    "labor.manage",
    "sanctions.manage",
    "dues.manage",
    "meetings.manage",
    "events.manage",
    "announcements.post",
    "maintenance.manage",
    "settings.manage",
    "audit.view",
  ],
  vice_president: ["members.manage", "tasks.manage_all", "sanctions.manage", "meetings.manage", "announcements.post", "audit.view"],
  treasurer: ["dues.manage", "announcements.post", "audit.view"],
  secretary: ["members.manage", "meetings.manage", "announcements.post"],
  house_manager: ["labor.manage", "sanctions.manage", "maintenance.manage", "announcements.post"],
  steward: ["labor.manage", "announcements.post"],
  standards: ["sanctions.manage", "announcements.post"],
  social_chair: ["events.manage", "announcements.post"],
  rush_chair: ["events.manage", "announcements.post"],
  new_member_educator: ["members.manage", "meetings.manage", "announcements.post"],
  risk_manager: ["events.manage", "announcements.post"],
  philanthropy_chair: ["events.manage", "announcements.post"],
  brotherhood_chair: ["events.manage", "announcements.post"],
  alumni_relations: ["events.manage", "announcements.post"],
  athletics_chair: ["events.manage", "announcements.post"],
  scholarship_chair: ["announcements.post"],
  historian: ["announcements.post"],
  webmaster: ["settings.manage", "members.manage", "announcements.post"],
};

export type CurrentUser = Member & {
  /** Slugs of chairs this member currently holds. */
  chairSlugs: string[];
  /** Ids of chairs this member currently holds. */
  chairIds: number[];
  permissions: Permission[];
};

export function permissionsFor(role: Member["role"], chairSlugs: string[]): Permission[] {
  if (role === "admin") return [...PERMISSIONS];
  const set = new Set<Permission>();
  for (const slug of chairSlugs) for (const p of CHAIR_PERMISSIONS[slug] ?? []) set.add(p);
  if (role === "officer" || chairSlugs.length > 0) set.add("announcements.post");
  return [...set];
}

export function can(user: CurrentUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions.includes(permission);
}

/** Officers are admins or anyone holding a chair. */
export function isOfficer(user: CurrentUser | null | undefined): boolean {
  return !!user && (user.role === "admin" || user.role === "officer" || user.chairSlugs.length > 0);
}

/** Can this user manage tasks that belong to the given chair? */
export function canManageChair(user: CurrentUser | null | undefined, chairId: number | null | undefined): boolean {
  if (!user) return false;
  if (can(user, "tasks.manage_all")) return true;
  return chairId != null && user.chairIds.includes(chairId);
}
