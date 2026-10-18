"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { members } from "@/db/schema";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { createSession, destroyAllSessionsFor, destroySession } from "@/lib/session";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { getCurrentUser, requireUserForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function login(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = parseForm(loginSchema, formData);
  if ("result" in parsed) return parsed.result;
  const { username, password, next } = parsed.data;
  const member = db.select().from(members).where(eq(members.username, username.toLowerCase())).get();
  if (!member || !(await verifyPassword(password, member.passwordHash))) {
    return fail("Wrong username or password.", undefined, { username });
  }
  if (member.status === "inactive" || member.status === "alumni") {
    return fail("This account is no longer active. Ask the webmaster to reactivate it.", undefined, { username });
  }
  const ua = (await headers()).get("user-agent");
  await createSession(member.id, ua);
  logAudit({ actorId: member.id, action: "login", entityType: "member", entityId: member.id, summary: `${member.username} logged in` });
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(target);
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  if (user) logAudit({ actorId: user.id, action: "logout", entityType: "member", entityId: user.id, summary: `${user.username} logged out` });
  await destroySession();
  redirect("/login");
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(1, "Enter a new password."),
  confirmPassword: z.string().min(1, "Confirm the new password."),
});

export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = parseForm(changePasswordSchema, formData);
    if ("result" in parsed) return parsed.result;
    const { currentPassword, newPassword, confirmPassword } = parsed.data;
    if (!(await verifyPassword(currentPassword, user.passwordHash))) return fail("Current password is wrong.");
    if (newPassword !== confirmPassword) return fail("New passwords do not match.");
    const weak = validatePasswordStrength(newPassword);
    if (weak) return fail(weak);
    if (newPassword === currentPassword) return fail("Pick a password different from the current one.");
    db.update(members)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date().toISOString() })
      .where(eq(members.id, user.id))
      .run();
    logAudit({ actorId: user.id, action: "password.change", entityType: "member", entityId: user.id, summary: `${user.username} changed their password` });
    return ok("Password updated.");
  });
}

/** Admin/webmaster: reset someone's password to a temporary one and force a change. */
export async function resetMemberPassword(memberId: number, temporaryPassword: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    if (!user.permissions.includes("members.manage")) return fail("You don't have permission to reset passwords.");
    const weak = validatePasswordStrength(temporaryPassword);
    if (weak) return fail(weak);
    db.update(members)
      .set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, updatedAt: new Date().toISOString() })
      .where(eq(members.id, memberId))
      .run();
    destroyAllSessionsFor(memberId);
    logAudit({ actorId: user.id, action: "password.reset", entityType: "member", entityId: memberId, summary: `${user.username} reset a member password` });
    return ok("Password reset. They must change it at next login.");
  });
}
