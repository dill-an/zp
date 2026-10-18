import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { todayISO } from "@/lib/dates";
import { searchMembers } from "@/lib/queries/members";
import { parseRosterParams, rosterToCsv } from "@/lib/queries/members-logic";

export const dynamic = "force-dynamic";

/** GET /members/export?q=&status=&class=&group=&chairs=1&all=1 -> text/csv (members.manage). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Log in first.", { status: 401 });
  if (!can(user, "members.manage")) return new Response("You don't have permission to export the roster.", { status: 403 });

  const sp: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    sp[key] = value;
  });
  const params = parseRosterParams(sp);
  const rows = searchMembers(params);
  const csv = rosterToCsv(rows);
  logAudit({ actorId: user.id, action: "member.export", entityType: "member", entityId: null, summary: `${user.username} exported ${rows.length} roster rows to CSV` });
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zp-roster-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
