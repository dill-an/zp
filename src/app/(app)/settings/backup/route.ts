import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { todayISO } from "@/lib/dates";
import { backupFilename } from "@/lib/queries/dashboard-logic";

export const dynamic = "force-dynamic";

/**
 * GET /settings/backup -> the whole SQLite database as a download (admin only).
 * `VACUUM INTO` writes a consistent copy to a temp file, which is streamed and then deleted.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Log in first.", { status: 401 });
  if (user.role !== "admin") return new Response("Only an admin can download the database backup.", { status: 403 });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zp-backup-"));
  const file = path.join(dir, "backup.sqlite");
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  try {
    db.run(sql`vacuum into ${file}`);
  } catch (err) {
    cleanup();
    return new Response(`Backup failed: ${err instanceof Error ? err.message : "unknown error"}`, { status: 500 });
  }
  const size = fs.statSync(file).size;
  logAudit({ actorId: user.id, action: "settings.backup", entityType: "setting", entityId: null, summary: `${user.username} downloaded a database backup (${Math.round(size / 1024)} KB)` });

  const stream = fs.createReadStream(file);
  stream.on("close", cleanup);
  stream.on("error", cleanup);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${backupFilename(todayISO())}"`,
      "Cache-Control": "no-store",
    },
  });
}
