# Module: community (key `community`, dev port 3107): events, announcements, maintenance

Owns `src/app/(app)/events/**`, `src/app/(app)/announcements/**`, `src/app/(app)/maintenance/**`, `src/lib/actions/community.ts`, `src/lib/queries/community.ts`, `src/lib/queries/community-logic.ts` (+ `.test.ts`), `e2e/community.spec.ts`.
Replace the stubs at `src/app/(app)/events/page.tsx`, `src/app/(app)/announcements/page.tsx`, `src/app/(app)/maintenance/page.tsx`. Tables: `events`, `event_rsvps`, `event_duties`, `announcements`, `maintenance_requests`; reads `meetings`, `chairs`, `members`.

## Events
- `/events` (everyone): tabs Upcoming / Past, `kind` filter; cards: title, kind pill, `formatDateTime` start (and end), location, mandatory badge, RSVP counts (going/maybe), my RSVP pill, owning chair. `events.manage`: New event, Edit, Delete (ConfirmButton).
- `/events/calendar` (everyone): month grid (`?month=YYYY-MM`, default current month in house timezone), weeks as rows, each day listing events and house meetings (from `meetings`) as small chips linking to their pages; previous/next month links; mobile: a day-by-day list under the grid.
- `/events/new`, `/events/[id]/edit` (`events.manage`): title, kind, startsAt, endsAt (datetime-local), location, description, chair (select), isMandatory, rsvpEnabled, budget dollars.
- `/events/[id]` (everyone): details; RSVP buttons (going / maybe / not going + guests number) when `rsvpEnabled`, lists of who is going/maybe/not going; duties section (`event_duties`): duty kind pill, label, member, start/end, status; `events.manage` adds duty rows (MemberSelect, kind, label, start, end), removes them, marks done/missed; a member can mark their own duty done. Mandatory events show a note "Attendance is mandatory".

## Announcements
- `/announcements` (everyone): pinned first then newest; show only those whose audience applies to the viewer (`all`; `officers` when `isOfficer(user)`; `new_members` when status new_member; `live_in` when livesInHouse) and not expired; posters (`announcements.post`) see `?all=1` including expired/other audiences. Render body as paragraphs with line breaks. `announcements.post`: New; edit/delete own (admin any); Pin/Unpin (admin or author).
- `/announcements/new`, `/announcements/[id]/edit`: title, body, audience, isPinned, expiresAt (date).

## Maintenance
- `/maintenance` (everyone): tabs Open / In progress / Resolved (includes wont_fix); anyone can "Report an issue" (title, description, location, priority); row/card: title, location, priority pill, status pill, reporter, assignee, age ("3 days ago" via date math), resolved date. `maintenance.manage`: assign (MemberSelect), set status, delete.
- `/maintenance/[id]`: detail; reporter can edit while open; `maintenance.manage` can assign, change status, add resolution notes (sets `resolvedAt` when resolved); assignee can mark in progress/resolved.

## Logic (`community-logic.ts`, tested)
`monthGrid(year, month)` (array of weeks of dates, Sunday first), `announcementVisible(a, viewer, now)`, `relativeAge(iso, now)`.

## Queries (`community.ts`)
`getUpcomingEvents(limit)`, `getEvent(id)`, `getActiveAnnouncements(user, limit?)`, `countOpenMaintenance()`, `getMyDuties(memberId)`, `listMaintenance(tab)`.

## Audit
Event/announcement/maintenance create, edit, delete, status changes.

## e2e (`e2e/community.spec.ts`)
Admin creates an event, brother RSVPs going and the count updates, admin adds a sober monitor duty for the brother and the brother marks it done; admin posts a pinned announcement visible to the brother and an officers-only one the brother cannot see; brother reports a maintenance issue, admin assigns and resolves it; calendar month renders with the event; mobile viewport renders events.
