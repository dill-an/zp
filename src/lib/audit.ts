import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export function logAudit(entry: {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number | string | null;
  summary: string;
}): void {
  db.insert(auditLog)
    .values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      summary: entry.summary,
    })
    .run();
}
