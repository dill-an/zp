# ZP House: module specs

Shared brief for everyone building a module. Read this, then your module's spec, then `CLAUDE.md`.

## What the house wants
A web app for the Zeta Psi chapter at MIT (about 42 brothers) that replaces their Google Sheets:
- Track in-progress tasks for each chair (officer) position: who is doing what, due when, done when.
- See how labor is divided: which cleans each brother is doing on which day, and what each brother is doing each week (the cleans sheet had a grid of jobs x weeks; they want a per-brother weekly view too).
- Track dues: who has paid, how much is due, and by when.
- Track punishment jobs (sanctions) and any assigned action by exactly who it is assigned to and when it is done.
- House meeting attendance (they have a sheet of Present/Absent/Excused per Sunday).
- All other essential fraternity functioning, comprehensive, maximally useful for brothers. Mobile first: brothers use phones.

## Foundation you build on
- Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Drizzle ORM on SQLite. Synchronous `db` (better-sqlite3): `.get()/.all()/.run()`.
- `src/db/schema.ts` is fixed. Do not edit it, do not add migrations. Work around gaps and list them in your report.
- Auth: `requireUser()` / `requirePermission()` in pages, `requireUserForAction()` / `requirePermissionForAction()` in actions. Permissions and chair mapping: `src/lib/permissions.ts`.
- Server actions and forms: see `src/lib/actions/auth.ts` and `src/app/login/login-form.tsx` for the reference pattern (`useActionState`, `parseForm`, `fail(..., values)`, `fieldValue`).
- Shared helpers: `src/lib/dates.ts`, `src/lib/money.ts`, `src/lib/names.ts`, `src/lib/audit.ts`, `src/lib/settings.ts`, `src/lib/queries/common.ts`. UI: `src/components/ui/index.ts`, `MemberLink`, `MemberSelect`.
- Seeded data from the real sheets: 42 members in pledge classes Psi, Omega, Beta Alpha, Beta Beta (new members); labor groups cooks/cleans; 13 job types; weeks 2026-09-13 to 2026-10-11 of clean assignments; 14 house meetings (5 with attendance); 18 chairs (no holders yet); 16 starter tasks; a Fall 2026 dues period with amount 0.
- Today inside the app is `todayISO()` (America/New_York). Treat 2026-10-18 as "now" for seeded data.

## File ownership
Each module owns exactly:
- `src/app/(app)/<module>/**` (pages and module-local components)
- `src/lib/actions/<module>.ts` (server actions, `"use server"`)
- `src/lib/queries/<module>.ts` (db reads, `import "server-only"`) and `src/lib/queries/<module>-logic.ts` (pure functions, unit tested with vitest in `src/lib/queries/<module>-logic.test.ts`)
- `e2e/<module>.spec.ts` (Playwright tests)
Never edit files outside your module, especially `src/db/schema.ts`, `src/lib/*` shared files, `src/components/ui/*`, `src/components/nav/*`, `src/app/(app)/layout.tsx`, `package.json`. If two modules need the same helper, each writes its own copy inside its own files.

## Cross-module routes (link to these; other agents are building them)
- Members: `/members`, `/members/[id]`; Chairs: `/chairs`, `/chairs/[slug]`
- Tasks: `/tasks`, `/tasks?chair=<chairId>`, `/tasks?assignee=<memberId>`, `/tasks/new?chair=<chairId>`, `/tasks/[id]`
- Labor: `/labor`, `/labor/week/[weekStart]`, `/labor/me`, `/labor/brothers`, `/labor/brothers/[memberId]`, `/labor/stats`, `/labor/verify`, `/labor/swaps`, `/labor/jobs`
- Dues: `/dues`, `/dues/members/[memberId]`, `/dues/periods`
- Sanctions: `/sanctions`, `/sanctions?member=<memberId>`, `/sanctions/new?member=<memberId>`, `/sanctions/[id]`
- Meetings: `/meetings`, `/meetings/[id]`, `/meetings/attendance`, `/meetings/attendance?member=<memberId>`, `/meetings/excuses`
- Events: `/events`, `/events/[id]`, `/events/calendar`; Announcements: `/announcements`; Maintenance: `/maintenance`, `/maintenance/[id]`
- Settings: `/settings`, `/settings/password`

## Query exports the dashboard will consume (implement these names in `src/lib/queries/<module>.ts`)
- labor: `getWeek(weekStart)`, `getWeekGrid(weekStart)`, `getMemberWeekJobs(memberId, weekStart)`, `getMemberUpcomingJobs(memberId, limit)`, `getMemberLaborStats(memberId)`, `getLaborStats()`, `listWeeks()`
- tasks: `getTasksForMember(memberId, { openOnly })`, `getTaskCountsByChair()`, `getOverdueTasks()`, `getTask(id)`
- members: `getMemberProfile(id)`; chairs: `getChairDetail(slug)`
- dues: `getMemberBalance(memberId, periodId?)`, `getBalances(periodId?)`, `getActivePeriod()`
- meetings: `getNextMeeting()`, `getAttendanceSummary(memberId)`, `getMemberAttendance(memberId)`
- sanctions: `getOpenSanctionsForMember(memberId)`, `getSanctionStats()`
- community: `getUpcomingEvents(limit)`, `getActiveAnnouncements(user)`, `countOpenMaintenance()`, `getMyDuties(memberId)`

## How to test your module
1. `scripts/dev.sh setup <key>` creates `data/agent-<key>.db` (seeded, password gate skipped). `scripts/dev.sh start <key> <port>` runs a dev server with hot reload on that db and its own `.next-<key>` build dir. `scripts/dev.sh log <key>` tails server errors. `scripts/dev.sh stop <key>` stops it. Use only your assigned key and port.
2. Write `e2e/<module>.spec.ts` with `@playwright/test`, using `login(page, ADMIN | BROTHER | CLEANER)` and `uniq()` from `e2e/helpers.ts`. Run it against your dev server: `E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test e2e/<module>.spec.ts`. Cover the main flows for an officer and for a plain brother (what they can see and cannot do), plus one mobile viewport check (`page.setViewportSize({ width: 390, height: 844 })`). Tests must create their own records (use `uniq()`), never depend on counts, and must pass when run twice.
3. `npm run typecheck`, `npm run lint`, `npm test` must pass for the whole repo. Errors in files you do not own are another agent's in-progress work; report them, do not fix them.
4. Never run `npm run build`, `npm run db:reset`, or touch `data/zp.db`. Stop your dev server and delete `.next-<key>` and `data/agent-<key>.db*` when you finish.

## Seeded logins (all passwords `zetapsi`)
- `dylan.nguyen`: admin (cleans group, Omega)
- `gio.mandwee`: plain brother, cooks group, Beta Alpha, no chair
- `martin.meister`: plain brother, cleans group, many seeded assignments
- `marcos.arroyo-cruz`: new member (Beta Beta), labor group none
To test chair-based permissions, assign a chair holder directly in SQL on your own db copy, e.g. `node -e "const D=require('better-sqlite3');const db=new D('data/agent-<key>.db');db.prepare(\"insert into chair_holders(chair_id,member_id,term_start) select id,(select id from members where username='gio.mandwee'),'2026-09-01' from chairs where slug='treasurer'\").run()"`.
