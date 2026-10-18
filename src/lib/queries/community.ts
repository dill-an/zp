import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements,
  chairs,
  eventDuties,
  eventRsvps,
  events,
  maintenanceRequests,
  meetings,
  members,
  type Announcement,
  type Event,
  type EventDuty,
  type EventKind,
  type MaintenanceRequest,
  type MeetingKind,
} from "@/db/schema";
import { nowISO } from "@/lib/dates";
import type { CurrentUser } from "@/lib/permissions";
import {
  announcementExpired,
  announcementVisible,
  eventIsPast,
  houseDate,
  maintenanceStatusesForTab,
  priorityRank,
  rsvpCounts,
  type EventTab,
  type MaintenanceTab,
  type RsvpCounts,
  type RsvpStatus,
} from "./community-logic";

/** The fields MemberLink needs. */
export type MemberRef = { id: number; firstName: string; lastName: string; preferredName: string };
export type ChairRef = { id: number; slug: string; name: string };

/** All members keyed by id (the house has ~42, so one query beats aliased joins). */
function memberMap(): Map<number, MemberRef> {
  const rows = db
    .select({ id: members.id, firstName: members.firstName, lastName: members.lastName, preferredName: members.preferredName })
    .from(members)
    .all();
  return new Map(rows.map((r) => [r.id, r]));
}

const chairRef = { id: chairs.id, slug: chairs.slug, name: chairs.name };

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type EventListItem = Event & { chair: ChairRef | null; counts: RsvpCounts; myRsvp: RsvpStatus | null };

function decorateEvents(rows: { event: Event; chair: ChairRef | null }[], viewerId?: number): EventListItem[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.event.id);
  const rsvps = db
    .select({ eventId: eventRsvps.eventId, memberId: eventRsvps.memberId, status: eventRsvps.status, guests: eventRsvps.guests })
    .from(eventRsvps)
    .where(inArray(eventRsvps.eventId, ids))
    .all();
  return rows.map(({ event, chair }) => {
    const mine = rsvps.filter((r) => r.eventId === event.id);
    return {
      ...event,
      chair,
      counts: rsvpCounts(mine),
      myRsvp: viewerId == null ? null : (mine.find((r) => r.memberId === viewerId)?.status ?? null),
    };
  });
}

/** Events for the list page. Upcoming are soonest first; past are most recent first. */
export function listEvents(opts: { tab: EventTab; kind?: EventKind; viewerId?: number; limit?: number } = { tab: "upcoming" }): EventListItem[] {
  const now = nowISO();
  const endsOrStarts = sql`coalesce(${events.endsAt}, ${events.startsAt})`;
  const query = db
    .select({ event: events, chair: chairRef })
    .from(events)
    .leftJoin(chairs, eq(chairs.id, events.chairId))
    .where(and(opts.tab === "past" ? lt(endsOrStarts, now) : gte(endsOrStarts, now), opts.kind ? eq(events.kind, opts.kind) : undefined))
    .orderBy(opts.tab === "past" ? desc(events.startsAt) : asc(events.startsAt));
  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return decorateEvents(rows, opts.viewerId);
}

/** Next `limit` events that have not ended yet (dashboard). */
export function getUpcomingEvents(limit: number, viewerId?: number): EventListItem[] {
  return listEvents({ tab: "upcoming", viewerId, limit });
}

export type EventRsvpRow = { member: MemberRef; status: RsvpStatus; guests: number; updatedAt: string };
export type EventDutyRow = EventDuty & { member: MemberRef | null };
export type EventDetail = EventListItem & {
  createdBy: MemberRef | null;
  rsvps: EventRsvpRow[];
  duties: EventDutyRow[];
  isPast: boolean;
};

export function getEvent(id: number, viewerId?: number): EventDetail | null {
  const row = db.select({ event: events, chair: chairRef }).from(events).leftJoin(chairs, eq(chairs.id, events.chairId)).where(eq(events.id, id)).get();
  if (!row) return null;
  const people = memberMap();
  const [base] = decorateEvents([row], viewerId);
  const rsvps = db
    .select()
    .from(eventRsvps)
    .where(eq(eventRsvps.eventId, id))
    .orderBy(asc(eventRsvps.updatedAt))
    .all()
    .flatMap((r) => {
      const member = people.get(r.memberId);
      return member ? [{ member, status: r.status, guests: r.guests, updatedAt: r.updatedAt }] : [];
    });
  const duties = db
    .select()
    .from(eventDuties)
    .where(eq(eventDuties.eventId, id))
    .orderBy(asc(sql`coalesce(${eventDuties.startsAt}, '')`), asc(eventDuties.id))
    .all()
    .map((d) => ({ ...d, member: d.memberId == null ? null : (people.get(d.memberId) ?? null) }));
  return {
    ...base,
    createdBy: row.event.createdById == null ? null : (people.get(row.event.createdById) ?? null),
    rsvps,
    duties,
    isPast: eventIsPast(row.event),
  };
}

export type MyDuty = EventDuty & { event: { id: number; title: string; startsAt: string; endsAt: string | null; location: string | null } };

/** A brother's unfinished duties at events that have not ended yet, soonest first. */
export function getMyDuties(memberId: number): MyDuty[] {
  const now = nowISO();
  return db
    .select({ duty: eventDuties, event: { id: events.id, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, location: events.location } })
    .from(eventDuties)
    .innerJoin(events, eq(events.id, eventDuties.eventId))
    .where(and(eq(eventDuties.memberId, memberId), eq(eventDuties.status, "assigned"), gte(sql`coalesce(${eventDuties.endsAt}, ${events.endsAt}, ${events.startsAt})`, now)))
    .orderBy(asc(sql`coalesce(${eventDuties.startsAt}, ${events.startsAt})`))
    .all()
    .map((r) => ({ ...r.duty, event: r.event }));
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export type CalendarItem = {
  type: "event" | "meeting";
  id: number;
  title: string;
  startsAt: string;
  /** House-timezone "YYYY-MM-DD". */
  date: string;
  href: string;
  isMandatory: boolean;
  kind: EventKind | MeetingKind;
};

/** Events and house meetings whose start falls on a house date in [fromDate, toDate], ordered by start. */
export function getCalendarItems(fromIso: string, toIso: string): CalendarItem[] {
  const eventRows = db
    .select({ id: events.id, title: events.title, startsAt: events.startsAt, isMandatory: events.isMandatory, kind: events.kind })
    .from(events)
    .where(and(gte(events.startsAt, fromIso), lt(events.startsAt, toIso)))
    .all();
  const meetingRows = db
    .select({ id: meetings.id, title: meetings.title, startsAt: meetings.scheduledAt, isMandatory: meetings.isMandatory, kind: meetings.kind })
    .from(meetings)
    .where(and(gte(meetings.scheduledAt, fromIso), lt(meetings.scheduledAt, toIso)))
    .all();
  const items: CalendarItem[] = [
    ...eventRows.map((e) => ({ type: "event" as const, ...e, date: houseDate(e.startsAt), href: `/events/${e.id}` })),
    ...meetingRows.map((m) => ({ type: "meeting" as const, ...m, date: houseDate(m.startsAt), href: `/meetings/${m.id}` })),
  ];
  return items.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export type AnnouncementRow = Announcement & { author: MemberRef | null; expired: boolean; visibleToViewer: boolean };

function decorateAnnouncements(rows: Announcement[], viewer: CurrentUser): AnnouncementRow[] {
  const people = memberMap();
  const now = new Date();
  return rows.map((a) => ({
    ...a,
    author: a.authorId == null ? null : (people.get(a.authorId) ?? null),
    expired: announcementExpired(a, now),
    visibleToViewer: announcementVisible(a, viewer, now),
  }));
}

/** Pinned first, then newest. `all` keeps expired and other-audience posts (for posters). */
export function listAnnouncements(viewer: CurrentUser, opts: { all?: boolean; limit?: number } = {}): AnnouncementRow[] {
  const rows = db.select().from(announcements).orderBy(desc(announcements.isPinned), desc(announcements.createdAt), desc(announcements.id)).all();
  const decorated = decorateAnnouncements(rows, viewer);
  const filtered = opts.all ? decorated : decorated.filter((a) => a.visibleToViewer);
  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

/** Announcements the viewer should see right now (dashboard). */
export function getActiveAnnouncements(viewer: CurrentUser, limit?: number): AnnouncementRow[] {
  return listAnnouncements(viewer, { limit });
}

export function getAnnouncement(id: number, viewer: CurrentUser): AnnouncementRow | null {
  const row = db.select().from(announcements).where(eq(announcements.id, id)).get();
  return row ? decorateAnnouncements([row], viewer)[0] : null;
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

export type MaintenanceRow = MaintenanceRequest & { reporter: MemberRef | null; assignee: MemberRef | null };

function decorateMaintenance(rows: MaintenanceRequest[]): MaintenanceRow[] {
  const people = memberMap();
  return rows.map((r) => ({
    ...r,
    reporter: r.reportedById == null ? null : (people.get(r.reportedById) ?? null),
    assignee: r.assignedToId == null ? null : (people.get(r.assignedToId) ?? null),
  }));
}

/** Requests on one tab. Unresolved tabs sort by priority then oldest first; resolved sorts newest resolution first. */
export function listMaintenance(tab: MaintenanceTab): MaintenanceRow[] {
  const rows = db
    .select()
    .from(maintenanceRequests)
    .where(inArray(maintenanceRequests.status, maintenanceStatusesForTab(tab)))
    .orderBy(desc(maintenanceRequests.createdAt), desc(maintenanceRequests.id))
    .all();
  if (tab === "resolved") {
    return decorateMaintenance(rows.sort((a, b) => ((b.resolvedAt ?? b.updatedAt) < (a.resolvedAt ?? a.updatedAt) ? -1 : 1)));
  }
  return decorateMaintenance(
    rows.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id)),
  );
}

export function countMaintenanceByTab(): Record<MaintenanceTab, number> {
  const rows = db
    .select({ status: maintenanceRequests.status, n: sql<number>`count(*)` })
    .from(maintenanceRequests)
    .groupBy(maintenanceRequests.status)
    .all();
  const by = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + Number(r.n), 0);
  return { open: by(["open"]), in_progress: by(["in_progress"]), resolved: by(["resolved", "wont_fix"]) };
}

/** Requests that still need attention (open or in progress). */
export function countOpenMaintenance(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(maintenanceRequests)
    .where(inArray(maintenanceRequests.status, ["open", "in_progress"]))
    .get();
  return Number(row?.n ?? 0);
}

export function getMaintenanceRequest(id: number): MaintenanceRow | null {
  const row = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get();
  return row ? decorateMaintenance([row])[0] : null;
}
