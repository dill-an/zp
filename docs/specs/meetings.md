# Module: meetings (key `meetings`, dev port 3105): meetings, attendance, excuses

Owns `src/app/(app)/meetings/**`, `src/lib/actions/meetings.ts`, `src/lib/queries/meetings.ts`, `src/lib/queries/meetings-logic.ts` (+ `.test.ts`), `e2e/meetings.spec.ts`.
Replace the stub at `src/app/(app)/meetings/page.tsx`. Tables: `meetings`, `attendance`, `excuse_requests` (rows with `meetingId`); inserts into `charges` and `sanctions` for fines. Seed has 14 Sunday house meetings (5 with attendance, matching the house's sheet).

## Routes
- `/meetings` (everyone): tabs Upcoming / Past (`?tab=`), kind filter. Row/card: title, kind pill, `formatDateTime`, location, mandatory badge; past: attendance counts (present/absent/excused/late) or "Attendance not taken"; upcoming: my excuse request status if any and a "Request excuse" button. `meetings.manage`: New meeting, Take attendance, Edit, Delete (ConfirmButton).
- `/meetings/new`, `/meetings/[id]/edit` (`meetings.manage`): title, kind, scheduledAt (datetime-local via `localInputToISO`/`isoToLocalInput`), location, agenda, isMandatory. On `/meetings/new` also a "Create weekly series" form: title, kind, weekday + time, first date, last date: creates one meeting per week skipping dates that already have a meeting of that kind at that date.
- `/meetings/[id]` (everyone): agenda, minutes (paragraphs), attendance grouped by pledge class with pills (after attendance is taken), my status, my pending excuse; "Request excuse" dialog (reason) for upcoming meetings. `meetings.manage`: Take attendance link, inline minutes editor (textarea + save), "Fine absences" two-step (preview: absent and not excused members without an existing fine charge for this meeting (match description "Missed <title> (<date>)"), then create `charges` kind `fine`, amount from setting `missed_meeting_fine_cents`, dueDate +14 days) and "Issue sanctions for absences" (one `sanctions` row per absent member, source `missed_meeting`, sourceRef meeting id, reason "Missed <title> (<date>)", dueAt +7 days; skip members who already have one for this meeting).
- `/meetings/[id]/attendance` (`meetings.manage`): roster of status active/new_member/abroad grouped by pledge class; per member a radio group present/absent/excused/late and a short note; defaults from existing records, else from approved excuse requests (excused), else absent; client button "Mark everyone present"; one save action upserting all rows (unique on meetingId+memberId) and setting `attendanceTaken` true, `recordedById`, `recordedAt`. Show who recorded and when.
- `/meetings/attendance` (everyone): the semester grid like the house meeting sheet: rows members grouped by pledge class, columns = meetings with attendance taken (kind filter, default house), cells P/A/E/L colored, per-member totals (present, absent, excused, late, rate %) and per-meeting totals; `?member=<id>` highlights and scrolls to that row; `?class=` filter; sticky first column. Below: "Most absences" list.
- `/meetings/excuses` (everyone sees own; `meetings.manage` reviews): pending meeting excuse requests with approve (if attendance already recorded, set it to excused) / deny + note.

## Logic (`meetings-logic.ts`, tested)
`attendanceSummary(rows)`, `attendanceRate(summary)`, `weeklySeries(first, last, weekday)`, `absenteesForFines(attendanceRows, existingChargeDescriptions)`.

## Queries (`meetings.ts`)
`listMeetings({ scope: 'upcoming' | 'past', kind? })`, `getMeeting(id)`, `getNextMeeting()`, `getAttendanceSummary(memberId)` -> `{ present, absent, excused, late, total, rate }`, `getMemberAttendance(memberId)`, `getAttendanceMatrix({ kind?, classId? })`.

## Audit
Attendance saved, fines, sanctions, excuse decisions, meeting create/edit/delete.

## e2e (`e2e/meetings.spec.ts`)
Seeded grid shows Martin Meister present on 9/13; admin creates a meeting, takes attendance (mark everyone present, set one absent), the meeting page shows counts; brother requests an excuse for an upcoming meeting, admin approves, attendance for that meeting defaults to excused for them; "Fine absences" preview shows the absent member and creates a charge (verify via `/dues/members/[id]` text if the dues module exists, else via the success message count); plain brother cannot open `/meetings/[id]/attendance`; mobile viewport renders the meetings list.
