# Module: labor (key `labor`, dev port 3101)

Owns `src/app/(app)/labor/**`, `src/lib/actions/labor.ts`, `src/lib/queries/labor.ts`, `src/lib/queries/labor-logic.ts` (+ `.test.ts`), `e2e/labor.spec.ts`.
Replace the stub at `src/app/(app)/labor/page.tsx`. Tables: `job_types`, `labor_weeks`, `job_assignments`, `job_swap_requests`, `excuse_requests` (rows with `assignmentId`), plus inserts into `sanctions` and `charges` when a clean is marked missed.

This is the module the user asked for most directly: "we have a google sheet with brothers and what cleans they're doing on what day. It'd be nice to have a feature where for each brother you can see what they're doing each week."

## Concepts
- A labor week starts on Sunday (`weekStart`, "YYYY-MM-DD"). `currentWeekStart()` and `weekStartFor()` are in `src/lib/dates.ts`.
- A job type has `slots` (1 or 2 people), `startOffsetDays`/`dueOffsetDays` relative to that Sunday (Mon-Wed commons: 1..3; "Sun" bathrooms: 7, i.e. the following Sunday; Monday Kitchen: 1; Sunday Kitchen: 7), `points` for fairness, `kind` (clean/cook/duty) and `category`.
- Due date of an assignment = `addDaysISO(weekStart, jobType.dueOffsetDays)`; its window label is `jobType.windowLabel`.
- Setting `labor_tracking_start` (default 2026-10-18) marks when completion tracking began. Seeded weeks before it have status `assigned` with no completion; show those as neutral "not tracked" (never overdue, never missed) unless a manager explicitly changes them. On or after it, an `assigned` job whose due date is before today is overdue.

## Routes
- `/labor` (everyone): weekly grid like the "All cleans" sheet for the current week. Week nav: previous/next Sunday links, a `<select>` of existing weeks, "This week". Rows: active job types in `sortOrder` grouped by category (Commons, Bathrooms, Kitchen, other); each row shows window label and due date, and one cell per slot with the assigned brother (`MemberLink` short), status pill, and, when the viewer is the assignee and status is `assigned`, a "Mark done" button. Unassigned slots show "Open". If no `labor_weeks` row exists for that Sunday: `EmptyState`; for `labor.manage` offer "Create empty week", "Copy last week" (copies the most recent earlier week's assignments as `assigned`), and "Auto-fill" (create + fill). Unpublished weeks render only for `labor.manage` (brothers see "Not posted yet").
  Manage mode (`?manage=1`, only `labor.manage`): every slot becomes a `MemberSelect` (pool = `listMembers({ activeOnly: true, laborPoolOnly: true })`, grouped by pledge class) with a per-row Save, plus "Auto-fill empty slots", "Clear all", Publish/Unpublish, week notes textarea, "Delete week" (ConfirmButton, only when nothing is done/verified).
- `/labor/week/[weekStart]`: same page for a given week. Validate "YYYY-MM-DD"; if it is not a Sunday redirect to that week's Sunday; otherwise 404 for garbage.
- `/labor/me` (everyone): my jobs: this week, next week, then history (most recent first), each with job name, window, due date and `dueDescription`, status pill, and actions: "Mark done" (assignee only; sets `done`, `completedAt`), "Undo" (back to `assigned`, only while not verified), "Request swap" (dialog: optional target brother, reason), "Request excuse" (dialog: reason). My semester totals (assigned, done, missed, excused, points) at the top. Pending swap/excuse requests listed with status.
- `/labor/brothers` (everyone): the per-brother weekly view. Rows = labor pool brothers (filter by labor group: all/cooks/cleans; search box), columns = every labor week in order (current week highlighted), cells list that brother's jobs for the week as compact chips (job short name, colored by status), last column totals (jobs, points). Sticky first column and horizontal scroll on small screens; also include a stacked per-brother list view toggle (`?view=list`) that reads well on a phone. Link each name to `/labor/brothers/[id]`.
- `/labor/brothers/[memberId]` (everyone): one brother's labor history week by week (job, window, due, status) and stats, links to `/members/[id]`.
- `/labor/stats` (everyone): fairness for the semester: per brother (grouped by labor group): assigned, done, missed, excused, points; highlight below-median; the sheet's "brothers who have not cleaned twice" as an explicit list (threshold selectable via `?min=2`); per job type: who has done it and how often; cooks vs cleans group sizes and average load. Pure math in `labor-logic.ts`.
- `/labor/jobs` (`labor.manage`): manage job types: list; create/edit form (name, kind, category, windowLabel, startOffsetDays, dueOffsetDays, slots, points, instructions, isActive, sortOrder); "Archive" (isActive false) instead of delete when assignments exist, delete allowed otherwise.
- `/labor/verify` (`labor.manage`): verification queue for a week (`?week=`, default current week, link to previous week): each assignment with status controls: Verify (done -> `verified` is not a status; keep status `done` and set `verifiedById`/`verifiedAt`; show "Verified" pill via a label), Mark done (on behalf), Mark missed, Mark excused, Reset to assigned. Marking missed shows a confirm step with a checkbox "Issue make-up sanction and fine" (default on): inserts a `sanctions` row (`source` `missed_clean`, `sourceRef` = assignment id, `reason` "Missed <job> (week of <date>)", `jobDescription` "Make-up clean: <job>", `dueAt` = now + 7 days, `status` open, `issuedById` = me) and, when setting `missed_clean_fine_cents` > 0, a `charges` row (`kind` fine, `amountCents` from the setting, `description` "Missed clean fine: <job> (week of <date>)", `sanctionId`, `dueDate` +14 days, `createdById` me). Bulk action: "Verify all done" for the week.
- `/labor/swaps` (everyone): my requests (cancel while pending), requests targeting me (accept/decline), open requests anyone can claim; `labor.manage` sees all pending and can approve or decline. Approval (manager, or automatic if the setting... keep it manual: manager approves) reassigns `job_assignments.memberId` to the accepting brother, appends a note "Swapped from X to Y", marks the request `approved`. Accepted-but-unapproved requests show "Awaiting approval".
- `/labor/excuses` (`labor.manage`): pending excuse requests for assignments: approve (assignment status `excused`) or deny, with note.

## Logic (`labor-logic.ts`, pure, tested)
- `dueDateFor(weekStart, jobType)`, `assignmentState(assignment, jobType, weekStart, today, trackingStart)` -> `not_tracked | upcoming | due_today | overdue | done | verified | missed | excused`.
- `autoFill({ weekStart, jobTypes, existing, pool, loads })`: for each empty slot pick the pool member with the lowest semester points (then fewest jobs this week, then lowest id), never the same person twice in one job type for the week, prefer `laborGroup === 'cleans'` for kind `clean` and `'cooks'` for kind `cook` when such members exist. Deterministic.
- `laborStats(assignments, jobTypes, members)`: totals per member and per job type; `belowThreshold(stats, min)`.

## Queries (`labor.ts`)
`listWeeks()`, `getWeek(weekStart)`, `getWeekGrid(weekStart)`, `getMemberWeekJobs(memberId, weekStart)`, `getMemberUpcomingJobs(memberId, limit)`, `getMemberLaborStats(memberId)`, `getLaborStats()`, `getBrothersWeeklyMatrix()`.

## Permissions
`labor.manage` for creating weeks, assigning, verifying, job types, approving swaps/excuses. Assignee for mark done/undo and requests. Everyone views published weeks, `/labor/brothers`, `/labor/stats`.

## Audit
Log week create/delete, assignment changes, status changes, swaps approved, sanctions issued.

## e2e (`e2e/labor.spec.ts`)
Admin creates the current week via Copy last week, assigns a slot in manage mode, cleaner (martin.meister) sees it on `/labor/me` and marks it done, admin verifies it on `/labor/verify`, `/labor/brothers` shows the job in Martin's row, `/labor/stats` renders, marking a job missed creates a sanction (check `/sanctions` text or query the db through the UI), plain brother cannot see manage controls, mobile viewport renders `/labor` without horizontal page overflow of the main container (grid itself may scroll).
