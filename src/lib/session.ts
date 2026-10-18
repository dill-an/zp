import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";

export const SESSION_COOKIE = "zp_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(memberId: number, userAgent?: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.insert(sessions)
    .values({ id: hashToken(token), memberId, expiresAt: expires.toISOString(), userAgent: userAgent ?? null })
    .run();
  // Opportunistically purge expired sessions.
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
}

/** Returns the member id for the current request's session cookie, or null. */
export async function readSessionMemberId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db.select().from(sessions).where(eq(sessions.id, hashToken(token))).get();
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) {
    db.delete(sessions).where(eq(sessions.id, row.id)).run();
    return null;
  }
  return row.memberId;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  store.delete(SESSION_COOKIE);
}

/** Log out every device for a member (e.g. after a password reset). */
export function destroyAllSessionsFor(memberId: number): void {
  db.delete(sessions).where(eq(sessions.memberId, memberId)).run();
}
