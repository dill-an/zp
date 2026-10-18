# Module: dashboard (key `dashboard`, dev port 3108): dashboard, settings, audit log, profile integration

Runs after the other modules exist. Owns `src/app/(app)/dashboard/**`, `src/app/(app)/settings/**` (keep the existing `settings/password/page.tsx`), `src/lib/actions/settings.ts`, `src/lib/queries/dashboard.ts`, `e2e/dashboard.spec.ts`. May also replace the bodies of the placeholder sections in `src/app/(app)/members/[id]/sections.tsx` (keep their names and props) using the other modules' query exports, and add missing `STATUS_TONES` entries in `src/components/ui/status-pill.tsx`.

## Dashboard (`/dashboard`, everyone)
Read the other modules' query files (`src/lib/queries/labor.ts`, `tasks.ts`, `dues.ts`, `sanctions.ts`, `meetings.ts`, `community.ts`, `members.ts`) and reuse their exports; do not duplicate queries that exist.
- Header: greeting with preferred name, today's date (`formatDate(todayISO(), { weekday: true, year: true })`), semester label from settings, `?denied=<permission>` shows a one-line notice "You do not have access to <permission>".
- "My week": my job assignments for the current week (job, window, due day, status, Mark done action via the labor module's server action if exported, else a link to `/labor/me`), plus next week's assignments; empty state links to `/labor`.
- "My tasks": open tasks assigned to me, overdue first, each linking to `/tasks/[id]`; count badge.
- "Dues": balance, status pill, next due date, link to `/dues`.
- "Sanctions": my open sanctions with due date, link.
- "Next meeting": date/time, location, my attendance rate this semester, link to `/meetings/[id]`.
- "Events": next 5 events with my RSVP pill; "My duties" (event duties assigned to me).
- Announcements: pinned and active, newest first, with a link to `/announcements`.
- Officer panel (only when `isOfficer(user)`): a card per chair I hold with open/overdue task counts linking to `/tasks?chair=`; for `labor.manage`: this week's unfilled slots and unverified done jobs with links to `/labor?manage=1` and `/labor/verify`; `dues.manage`: outstanding total and overdue count linking to `/dues`; `meetings.manage`: next meeting without attendance taken; `maintenance.manage`: open requests; `sanctions.manage`: sanctions awaiting verification; pending swap and excuse requests counts for `labor.manage` / `meetings.manage`.
- "House pulse" (everyone): this week's labor completion (done or verified / assigned), last meeting attendance rate, open maintenance count, number of brothers with zero cleans this semester.
Layout: a responsive grid of Cards; on a phone it is a single column in the order above.

## Settings
- `/settings` (everyone): my profile summary with links to `/members/[id]`, `/members/[id]/edit`, `/settings/password`; for `settings.manage`: "House settings" form saving with `setSetting` for every key in `SETTING_KEYS` (org name, chapter name, semester label, labor tracking start date, Venmo handle, house meeting weekday and time, missed clean fine dollars, missed meeting fine dollars) plus `sanctions_policy` is owned by the sanctions module (link to it). Data section: links to `/members/export`, `/dues/export`, and "Download database backup" (`/settings/backup` route handler, admin only: copy the SQLite file with `VACUUM INTO` to a temp file and stream it as `application/x-sqlite3` with a dated filename).
- `/settings/audit` (`audit.view`): audit log, newest first, 50 per page (`?page=`), filters `actor=`, `entity=`, `q=`.

## Profile integration (`src/app/(app)/members/[id]/sections.tsx`)
Replace each placeholder body: `LaborSection` (this week's jobs and semester stats, link to `/labor/brothers/[id]`), `TasksSection` (open tasks assigned), `DuesSection` (balance and status; only for self or `dues.manage`), `AttendanceSection` (summary counts and rate), `SanctionsSection` (open sanctions; only self or `sanctions.manage`).

## e2e (`e2e/dashboard.spec.ts`)
Admin dashboard shows the officer panel and house pulse; a brother's dashboard shows My week with a seeded or newly created assignment, dues and next meeting cards; settings form saves the Venmo handle and `/dues` shows it; audit page lists entries; backup download responds with the sqlite content type; plain brother cannot open `/settings/audit`.
