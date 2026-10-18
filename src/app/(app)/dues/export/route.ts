import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isoToLocalInput, todayISO } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { can } from "@/lib/permissions";
import { getBalances, getPeriod } from "@/lib/queries/dues";
import { centsToCsv, statusLabel, toCsv } from "@/lib/queries/dues-logic";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /dues/export?period=<id|all>: CSV of every current member's balance (treasurer only). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Fdues", req.url));
  if (!can(user, "dues.manage")) return new NextResponse("Forbidden", { status: 403 });

  const param = req.nextUrl.searchParams.get("period");
  let periodId: number | undefined;
  let periodName = "all periods";
  if (param && param !== "all") {
    const n = Number(param);
    const period = Number.isInteger(n) && n > 0 ? getPeriod(n) : null;
    if (!period) return new NextResponse("Not found", { status: 404 });
    periodId = period.id;
    periodName = period.name;
  }

  const rows = getBalances(periodId);
  const csv = toCsv([
    ["Name", "Username", "Pledge class", "Charged", "Paid", "Balance", "Status", "Last payment"],
    ...rows.map((r) => [
      displayName(r.member),
      r.member.username,
      r.member.pledgeClass?.name ?? "",
      centsToCsv(r.chargedCents),
      centsToCsv(r.paidCents),
      centsToCsv(r.balanceCents),
      statusLabel(r.status),
      r.lastPaymentAt ? isoToLocalInput(r.lastPaymentAt).slice(0, 10) : "",
    ]),
  ]);
  logAudit({ actorId: user.id, action: "dues.export", entityType: "dues_period", entityId: periodId ?? null, summary: `${user.username} exported the dues CSV for ${periodName}` });
  const filename = `dues-${slugify(periodName)}-${todayISO()}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
