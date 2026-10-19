/**
 * Per-member calendar subscription: signed feed tokens and a small iCalendar (RFC 5545) writer.
 * No database access here; the dashboard query module gathers the events.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { addDaysISO } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export const CALENDAR_TOKEN_LENGTH = 32;

/** SESSION_SECRET signs the calendar links too; the fallback matches the session default for dev. */
export function calendarSecret(): string {
  return process.env.SESSION_SECRET || "dev-secret";
}

/** HMAC-SHA256 of the member id, truncated to 32 hex characters. Stable for a member as long as the secret is. */
export function calendarTokenFor(memberId: number, secret: string = calendarSecret()): string {
  return createHmac("sha256", secret).update(String(memberId)).digest("hex").slice(0, CALENDAR_TOKEN_LENGTH);
}

/**
 * The member whose token this is, checked in constant time against every candidate id (the house has
 * about 42 members, so recomputing each HMAC is cheap). Null for a malformed or unknown token.
 */
export function memberIdForToken(token: string, memberIds: Iterable<number>, secret: string = calendarSecret()): number | null {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const given = Buffer.from(token, "hex");
  let found: number | null = null;
  for (const id of memberIds) {
    const expected = Buffer.from(calendarTokenFor(id, secret), "hex");
    // Keep scanning after a hit so the time taken does not say which id matched.
    if (timingSafeEqual(given, expected)) found = id;
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Subscription URLs                                                   */
/* ------------------------------------------------------------------ */

/** Host and scheme as the browser sees them, honouring a reverse proxy's forwarded headers. */
export function publicBaseUrl(get: (name: string) => string | null): string {
  const host = (get("x-forwarded-host") ?? get("host") ?? "localhost:3000").split(",")[0].trim();
  const forwardedProto = get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwardedProto || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function calendarFeedPath(token: string): string {
  return `/api/calendar/${token}`;
}

/** Both links for the settings card: webcal:// opens the subscribe flow on iPhone and Mac. */
export function calendarFeedUrls(baseUrl: string, token: string): { https: string; webcal: string } {
  const https = `${baseUrl}${calendarFeedPath(token)}`;
  return { https, webcal: https.replace(/^https?:\/\//, "webcal://") };
}

/* ------------------------------------------------------------------ */
/* iCalendar writer                                                    */
/* ------------------------------------------------------------------ */

export type CalEvent = {
  /** Unique within the feed, e.g. "job-12". The "@zp-house" domain part is added here. */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** All-day event on this "YYYY-MM-DD" (house calendar date). */
  date?: string;
  /** Timed event: ISO instants. `end` defaults to one hour after `start`. */
  start?: string;
  end?: string | null;
};

export const DEFAULT_EVENT_MINUTES = 60;

/** Backslash-escape the characters RFC 5545 reserves in text values. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** "20261021T230000Z" for an ISO instant. */
export function formatUtcStamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** "20261021" for a calendar date. */
export function formatDateValue(date: string): string {
  return date.replace(/-/g, "");
}

/** Fold a content line at 75 octets with CRLF plus one space, as the spec requires. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // Continuation lines start with a space, which counts toward the 75-octet limit.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function eventLines(e: CalEvent, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}@zp-house`, `DTSTAMP:${stamp}`];
  if (e.date) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateValue(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateValue(addDaysISO(e.date, 1))}`);
  } else if (e.start) {
    const startMs = Date.parse(e.start);
    const end = e.end ?? new Date(startMs + DEFAULT_EVENT_MINUTES * 60_000).toISOString();
    lines.push(`DTSTART:${formatUtcStamp(e.start)}`);
    lines.push(`DTEND:${formatUtcStamp(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push("END:VEVENT");
  return lines;
}

/** A complete VCALENDAR document (CRLF line endings, folded lines). Events without a date or start are skipped. */
export function buildICalendar(events: readonly CalEvent[], opts: { name: string; now?: Date; description?: string } = { name: "ZP House" }): string {
  const stamp = formatUtcStamp(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZP House//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    ...(opts.description ? [`X-WR-CALDESC:${escapeText(opts.description)}`] : []),
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    if (!e.date && !e.start) continue;
    lines.push(...eventLines(e, stamp));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
