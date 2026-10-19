import { buildICalendar, memberIdForToken, publicBaseUrl } from "@/lib/calendar";
import { listMembers } from "@/lib/queries/common";
import { getCalendarFeed } from "@/lib/queries/dashboard";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/<token> -> the member's personal iCalendar feed. No session: calendar apps poll
 * this URL on their own, so the token (an HMAC of the member id, see src/lib/calendar.ts) is the
 * only credential. Reads only, so nothing is audited.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Only members who can still log in get a feed; alumni and inactive brothers do not.
  const memberId = memberIdForToken(token, listMembers({ activeOnly: true }).map((m) => m.id));
  if (memberId == null) return new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });

  const now = new Date();
  const baseUrl = publicBaseUrl((name) => req.headers.get(name));
  const ics = buildICalendar(getCalendarFeed(memberId, { now, baseUrl }), {
    name: getSetting(SETTING_KEYS.chapterName) || "ZP House",
    description: "Your cleans, events and duties, house meetings and sanction deadlines.",
    now,
  });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="zp-house.ics"',
      // Calendar apps refetch on their own schedule; a short private cache keeps repeat polls cheap.
      "Cache-Control": "private, max-age=300",
    },
  });
}
