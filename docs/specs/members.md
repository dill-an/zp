# Module: members (key `members`, dev port 3103): roster and chairs

Owns `src/app/(app)/members/**`, `src/app/(app)/chairs/**`, `src/lib/actions/members.ts`, `src/lib/actions/chairs.ts`, `src/lib/queries/members.ts`, `src/lib/queries/chairs.ts`, `src/lib/queries/members-logic.ts` (+ `.test.ts`), `e2e/members.spec.ts`.
Replace the stubs at `src/app/(app)/members/page.tsx` and `src/app/(app)/chairs/page.tsx`. Tables: `members`, `pledge_classes`, `chairs`, `chair_holders`; reads `tasks` for counts. Password reset uses `resetMemberPassword` from `src/lib/actions/auth.ts`; hashing uses `hashPassword` from `src/lib/password.ts`.

## Routes: members
- `/members` (everyone): roster. Search (`q`, matches first/last/preferred/username), filters: status, pledge class, labor group, "chair holders only"; default hides inactive/alumni (`?all=1` shows them). Summary line: active count, per pledge class, cooks vs cleans. Desktop table: name (`MemberLink` with avatar), pledge class, status pill, labor group pill, chairs (badges), room, phone and email when present; role column for `members.manage`. Mobile: cards. For `members.manage`: "Add member", "Pledge classes", "Export CSV" (`/members/export` route handler: text/csv, same filters).
- `/members/[id]` (everyone): profile header (avatar, name, preferred name, username, pledge class, status, labor group, role), chairs held now and before (with terms), contact (email, phone, room, lives in house), academics (major, grad year), birthday; emergency contact and dietary notes only to the member and `members.manage`; admin notes only to `members.manage`. Buttons: Edit (self or `members.manage`), Reset password (`members.manage`: dialog with temporary password, calls `resetMemberPassword`), Deactivate / Reactivate (`members.manage`, ConfirmButton; sets status inactive/active). Below the header render these placeholder sections as separate exported server components in `src/app/(app)/members/[id]/sections.tsx`: `LaborSection`, `TasksSection`, `DuesSection`, `AttendanceSection`, `SanctionsSection`, each an `EmptyState` with a link to the owning module (`/labor/brothers/[id]`, `/tasks?assignee=`, `/dues/members/[id]`, `/meetings/attendance?member=`, `/sanctions?member=`). The integrator will replace their bodies later; keep their props to `{ memberId: number; viewer: CurrentUser }`.
- `/members/[id]/edit`: self edits preferredName, email, phone, room, livesInHouse, major, gradYear, birthday, emergencyContact, dietaryNotes. `members.manage` also edits firstName, lastName, username (unique, lowercase, `a-z0-9.-`), pledgeClass, status, laborGroup, notes, and role (only admins may grant or remove admin). Validate with zod; re-populate on failure.
- `/members/new` (`members.manage`): create: names, preferred name, username (auto-suggest `first.last` slug, ensure unique), temporary password (min 8, `mustChangePassword` true), pledge class, status, labor group, role, contact fields.
- `/members/classes` (`members.manage`): pledge classes with member counts; add/edit (name, sortOrder, semesterLabel, notes); delete only when empty.

## Routes: chairs
- `/chairs` (everyone): active chairs grouped by category (exec first) as cards: name, holders (`MemberLink`) or "Unassigned", description, open task count linking to `/tasks?chair=<id>` (count `tasks` where chairId and status not in done/cancelled; overdue count too). `chairs.manage`: "Add chair", edit links, `?all=1` shows inactive.
- `/chairs/[slug]` (everyone): description, responsibilities (lines starting with "- " rendered as a list), current holders, holder history, "View tasks" (`/tasks?chair=<id>`), "New task" (`/tasks/new?chair=<id>`), the 10 most recent open tasks for the chair (title, due, status) read directly from `tasks`. `chairs.manage`: "Assign holder" (MemberSelect grouped + term start date default today + "co-chair, keep current holder" checkbox; otherwise end current holders' terms the day before), "End term" per holder, "Edit chair".
- `/chairs/new`, `/chairs/[slug]/edit` (`chairs.manage`): name, slug (auto from name on create, immutable after), category, isExec, description, responsibilities (textarea, one per line, stored as "- " lines), sortOrder, isActive.
- Role sync: assigning a holder whose role is `member` sets role `officer`; ending someone's last active term sets `officer` back to `member` (never touch `admin`).

## Logic (`members-logic.ts`, tested)
`suggestUsername(first, last, taken)`, `parseResponsibilities(text)` / `formatResponsibilities(lines)`, `rosterSummary(members)`.

## Queries
`members.ts`: `getMemberProfile(id)` (member, pledge class, current chairs, chair history), `searchMembers(params)`, `listPledgeClassesWithCounts()`. `chairs.ts`: `getChairDetail(slug)`, `listChairsWithCounts()`, `getOpenTaskCountsByChair()`.

## Audit
Member create/edit/status/role changes, password resets (already logged in auth), chair holder changes, chair edits.

## e2e (`e2e/members.spec.ts`)
Roster lists seeded brothers and filters by pledge class and labor group; admin adds a member and the new member can log in with the temporary password (and hits the password gate text "Set your password"); admin assigns a chair holder, the chair page shows them, the holder's profile shows the chair; the holder (log in as them) now sees officer-only controls somewhere (e.g. the chair edit link is still hidden but `/tasks/new?chair=` would be allowed; at minimum assert their role label in the sidebar shows the chair name); plain brother cannot open `/members/new` (redirected to dashboard); self-edit of phone works; CSV export responds with text/csv; mobile viewport renders the roster cards.
