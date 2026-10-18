import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { chairHolders, chairs, members } from "@/db/schema";
import { readSessionMemberId } from "./session";
import { can, permissionsFor, type CurrentUser, type Permission } from "./permissions";

/** Load a member plus their current chairs and permissions. */
export function loadCurrentUser(memberId: number): CurrentUser | null {
  const member = db.select().from(members).where(eq(members.id, memberId)).get();
  if (!member) return null;
  const held = db
    .select({ slug: chairs.slug, id: chairs.id })
    .from(chairHolders)
    .innerJoin(chairs, eq(chairs.id, chairHolders.chairId))
    .where(and(eq(chairHolders.memberId, memberId), isNull(chairHolders.termEnd), eq(chairs.isActive, true)))
    .all();
  const chairSlugs = held.map((h) => h.slug);
  return {
    ...member,
    chairSlugs,
    chairIds: held.map((h) => h.id),
    permissions: permissionsFor(member.role, chairSlugs),
  };
}

/** Current user for this request (memoized per request). Null when logged out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await readSessionMemberId();
  if (!id) return null;
  const user = loadCurrentUser(id);
  if (!user || user.status === "inactive" || user.status === "alumni") return null;
  return user;
});

/** Redirects to /login when logged out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects to /login when logged out, to /dashboard when the permission is missing. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/dashboard?denied=" + encodeURIComponent(permission));
  return user;
}

/** For server actions: returns the user or throws an Error (never redirects). */
export async function requireUserForAction(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be logged in.");
  return user;
}

export async function requirePermissionForAction(permission: Permission): Promise<CurrentUser> {
  const user = await requireUserForAction();
  if (!can(user, permission)) throw new Error("You don't have permission to do that.");
  return user;
}
