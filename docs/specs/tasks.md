# Module: tasks (key `tasks`, dev port 3102)

Owns `src/app/(app)/tasks/**`, `src/lib/actions/tasks.ts`, `src/lib/queries/tasks.ts`, `src/lib/queries/tasks-logic.ts` (+ `.test.ts`), `e2e/tasks.spec.ts`.
Replace the stub at `src/app/(app)/tasks/page.tsx`. Tables: `tasks`, `task_assignees`, `task_checklist_items`, `task_activity`; reads `chairs`, `chair_holders`, `members`.

The user: "track in-progress tasks for each chair position", and "actions by exactly who they're assigned to and when they're done".

## Routes
- `/tasks` (everyone): `LinkTabs`: "Mine" (assigned to me, open first; default for everyone), "Open" (all open), "By chair" (grouped by chair in chair `sortOrder`, "General" for `chairId` null, each group with open/overdue counts and a "New task" link preselecting the chair), "Done" (recently completed, newest first, 50 max). Filters via searchParams on every tab: `chair=<id>`, `assignee=<memberId>`, `status=`, `priority=`, `q=` (title search). Row/card: title (link), chair badge, assignee names (avatars), due (`dueDescription`, danger tone when overdue), priority pill (only when high/urgent), status pill, checklist progress "2/4", quick "Done" button for assignees/managers. Sort: overdue first, then due date ascending, then priority, then createdAt. Mobile: cards.
- `/tasks/new` (everyone logged in; `?chair=<id>` and `?assignee=<id>` preselect): title, description, chair (select of active chairs, blank = General), assignees (checkbox list grouped by pledge class, or `MemberSelect` with `multiple`), due (`datetime-local` -> `localInputToISO`), priority, recurrence, checklist (textarea, one line per item), tags (comma separated). Rules: anyone may create a General task or a task assigned to themselves; choosing a chair requires `canManageChair(user, chairId)`.
- `/tasks/[id]` (everyone): details, chair link, creator, assignees, due, priority, recurrence, tags, checklist with per-item toggle (assignees, creator, chair managers), add item, delete item; status buttons: Start (`in_progress`, sets `startedAt`), Block (`blocked`), Done (`done`, `completedAt`, `completedById`), Reopen (`todo`), Cancel (`cancelled`); allowed for assignees, creator, chair managers, `tasks.manage_all`. Activity feed from `task_activity` (newest last) with a comment form (anyone logged in). Edit and Delete (ConfirmButton) for creator / chair manager / `tasks.manage_all`.
- `/tasks/[id]/edit`: same fields as new; reassigning logs an `assignment` activity entry.
- Recurrence: on Done, when `recurrence != none`, create the next occurrence (copy title, description, chairId, priority, recurrence, tags, assignees, fresh checklist items unchecked) with `dueAt` = previous due + 7/14/30 days (or completion + interval when no due); log activity on both tasks.
- `/tasks/overdue` is not needed; overdue is a filter (`status=overdue` meaning open and past due).

## Logic (`tasks-logic.ts`, pure, tested)
`isOverdue(task, now)`, `sortTasks(tasks, now)`, `nextOccurrenceDue(dueAt, completedAt, recurrence)`, `checklistProgress(items)`.

## Queries (`tasks.ts`)
`getTask(id)` (with chair, creator, assignees, checklist, activity), `listTasks(filters)`, `getTasksForMember(memberId, { openOnly })`, `getTaskCountsByChair()` -> `Map<number | null, { open: number; overdue: number }>`, `getOverdueTasks()`.

## Audit
Log create, status change, delete, reassignment.

## e2e (`e2e/tasks.spec.ts`)
Admin creates a task under a chair with two assignees and a checklist, it appears in By chair and in the assignee's Mine tab (log in as that brother), the brother toggles a checklist item and marks it done, Done tab shows it; a recurring task marked done creates a next occurrence; a plain brother cannot create a task under a chair (control hidden and action rejected); filters by chair work; mobile viewport renders the list.
