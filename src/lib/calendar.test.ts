import { describe, expect, it } from "vitest";
import { buildICalendar, calendarFeedUrls, calendarTokenFor, escapeText, foldLine, formatUtcStamp, memberIdForToken, publicBaseUrl } from "./calendar";

describe("calendar tokens", () => {
  it("is 32 lowercase hex characters and stable for a member", () => {
    const t = calendarTokenFor(18, "secret-a");
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(calendarTokenFor(18, "secret-a")).toBe(t);
    expect(calendarTokenFor(19, "secret-a")).not.toBe(t);
    expect(calendarTokenFor(18, "secret-b")).not.toBe(t);
  });

  it("finds the member for a token and rejects everything else", () => {
    const ids = [13, 18, 22];
    expect(memberIdForToken(calendarTokenFor(22, "s"), ids, "s")).toBe(22);
    expect(memberIdForToken(calendarTokenFor(22, "s"), [13, 18], "s")).toBeNull();
    expect(memberIdForToken(calendarTokenFor(22, "other"), ids, "s")).toBeNull();
    expect(memberIdForToken("", ids, "s")).toBeNull();
    expect(memberIdForToken("not-hex-at-all-0123456789abcdef", ids, "s")).toBeNull();
    expect(memberIdForToken(calendarTokenFor(22, "s").toUpperCase(), ids, "s")).toBeNull();
    expect(memberIdForToken(calendarTokenFor(22, "s") + "00", ids, "s")).toBeNull();
  });

  it("falls back to the dev secret when SESSION_SECRET is unset", () => {
    const prev = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(calendarTokenFor(5)).toBe(calendarTokenFor(5, "dev-secret"));
    } finally {
      if (prev !== undefined) process.env.SESSION_SECRET = prev;
    }
  });
});

describe("subscription urls", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

  it("builds the base url from forwarded headers, defaulting to https off localhost", () => {
    expect(publicBaseUrl(headers({ host: "zp.example.org" }))).toBe("https://zp.example.org");
    expect(publicBaseUrl(headers({ host: "localhost:3114" }))).toBe("http://localhost:3114");
    expect(publicBaseUrl(headers({ host: "127.0.0.1:3114" }))).toBe("http://127.0.0.1:3114");
    expect(publicBaseUrl(headers({ host: "10.0.0.5:3000", "x-forwarded-host": "zp.example.org", "x-forwarded-proto": "https" }))).toBe("https://zp.example.org");
    expect(publicBaseUrl(headers({ host: "zp.example.org", "x-forwarded-proto": "http" }))).toBe("http://zp.example.org");
    expect(publicBaseUrl(headers({}))).toBe("http://localhost:3000");
  });

  it("gives an https and a webcal link", () => {
    const urls = calendarFeedUrls("https://zp.example.org", "abc");
    expect(urls.https).toBe("https://zp.example.org/api/calendar/abc");
    expect(urls.webcal).toBe("webcal://zp.example.org/api/calendar/abc");
    expect(calendarFeedUrls("http://127.0.0.1:3114", "abc").webcal).toBe("webcal://127.0.0.1:3114/api/calendar/abc");
  });
});

describe("iCalendar writer", () => {
  it("escapes reserved characters", () => {
    expect(escapeText("a, b; c\\d\nline")).toBe("a\\, b\\; c\\\\d\\nline");
  });

  it("formats UTC stamps", () => {
    expect(formatUtcStamp("2026-10-21T23:00:00.000Z")).toBe("20261021T230000Z");
    expect(formatUtcStamp(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z");
  });

  it("folds long lines at 75 octets", () => {
    const long = "SUMMARY:" + "x".repeat(100);
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBe(2);
    expect(Buffer.byteLength(parts[0])).toBe(75);
    expect(parts[1].startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    // Multibyte characters are never split.
    const greek = "SUMMARY:" + "Ψ".repeat(60);
    for (const part of foldLine(greek).split("\r\n")) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(foldLine(greek).replace(/\r\n /g, "")).toBe(greek);
    expect(foldLine("short")).toBe("short");
  });

  it("writes all-day and timed events with CRLF endings", () => {
    const ics = buildICalendar(
      [
        { uid: "job-1", summary: "Clean: Upstairs Commons", date: "2026-10-21", url: "https://zp.example.org/labor/week/2026-10-18" },
        { uid: "event-2", summary: "Mixer, with guests", start: "2026-10-23T23:00:00.000Z", end: null, location: "House basement" },
        { uid: "meeting-3", summary: "House Meeting", start: "2026-10-25T23:00:00.000Z", end: "2026-10-26T00:30:00.000Z", description: "Line one\nLine two" },
        { uid: "skipped", summary: "No date" },
      ],
      { name: "ZP House", now: new Date("2026-10-19T12:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:ZP House\r\n");
    expect(ics).toContain("UID:job-1@zp-house\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022\r\n");
    expect(ics).toContain("SUMMARY:Clean: Upstairs Commons\r\n");
    expect(ics).toContain("URL:https://zp.example.org/labor/week/2026-10-18\r\n");
    // A timed event without an end lasts one hour.
    expect(ics).toContain("DTSTART:20261023T230000Z\r\nDTEND:20261024T000000Z\r\n");
    expect(ics).toContain("SUMMARY:Mixer\\, with guests\r\n");
    expect(ics).toContain("LOCATION:House basement\r\n");
    expect(ics).toContain("DTSTART:20261025T230000Z\r\nDTEND:20261026T003000Z\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\r\n");
    expect(ics).toContain("DTSTAMP:20261019T120000Z\r\n");
    expect(ics).not.toContain("No date");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
    // Every line is a content line or a folded continuation; no bare LF.
    expect(ics.includes("\n") && !/[^\r]\n/.test(ics)).toBe(true);
  });
});
