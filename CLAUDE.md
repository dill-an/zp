# ZP House: conventions

Fraternity management app for Zeta Psi (MIT). Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Drizzle ORM on SQLite (better-sqlite3), server actions with zod.

## Commands
- `npm run typecheck` and `npm run lint` are the fast checks. Run both before you finish.
- `npm run build` is reserved for the integrator; do not run it while other agents are working (it rewrites `.next`).
- `npm run db:reset` wipes and reseeds `data/zp.db`. `FORCE_SEED=1 npm run db:seed` reseeds without deleting the file.
- `scripts/server.sh start <port> [dbPath]` / `stop <port>` runs a production server from the last build. Prefer `npm run dev -- -p <port>` for iterating (dev server; each agent uses its own port).
- `npm test` runs vitest unit tests in `src/**/*.test.ts` and `tests/`.
- Default seeded password is `zetapsi`; every seeded member must change it on first login. Seeding with `SEED_SKIP_PASSWORD_CHANGE=1` skips that gate (used for e2e). Admin: `dylan.nguyen`.

## Layout
- `src/db/schema.ts` is the single source of truth. Do not edit it or add migrations; if a column is missing, work around it and report it.
- `src/db/index.ts` exports `db` (synchronous better-sqlite3 driver: use `.get()`, `.all()`, `.run()`; no `await` on queries).
- `src/lib/auth.ts`: `getCurrentUser()`, `requireUser()`, `requirePermission(perm)` for pages; `requireUserForAction()` / `requirePermissionForAction(perm)` for server actions.
- `src/lib/permissions.ts`: permission names, `can(user, perm)`, `canManageChair(user, chairId)`, `isOfficer(user)`.
- `src/lib/action-result.ts`: `ActionResult`, `ok()`, `fail()`, `parseForm(zodSchema, formData)`, `runAction(fn)`.
- `src/lib/dates.ts`: `todayISO()`, `currentWeekStart()`, `weekStartFor()`, `addDaysISO()`, `formatDate()`, `formatDateTime()`, `localInputToISO()`, `isoToLocalInput()`, `dueDescription()`. Calendar dates are `YYYY-MM-DD`, instants are ISO UTC strings, house timezone is America/New_York.
- `src/lib/money.ts`: `formatCents()`, `parseDollarsToCents()`, `centsToInput()`. Money is integer cents.
- `src/lib/names.ts`: `displayName()`, `shortName()`, `fullName()`, `initials()`.
- `src/lib/audit.ts`: `logAudit({...})` for every mutation that matters.
- `src/lib/settings.ts`: `getSetting(key)` / `setSetting()`; keys in `settings-keys.ts`.
- `src/components/ui/*`: Button, ButtonLink, SubmitButton, ConfirmButton, Card*, Badge, StatusPill, Input/Select/Textarea/Checkbox/Field/FormMessage/FormRow, Table/THead/TBody/Tr/Th/Td, PageHeader, EmptyState, Avatar, Stat, LinkTabs, Dialog. Import from `@/components/ui`.
- `src/components/member-link.tsx`: `MemberLink` for any member name. `src/components/member-select.tsx`: `MemberSelect` for picking a brother.
- `src/lib/queries/common.ts`: `listMembers()`, `getMember()`, `listPledgeClasses()`, `listChairs()`, `getChairBySlug()`, `groupByPledgeClass()`.
- Module code lives in `src/app/(app)/<module>/` (pages, module-local components), `src/lib/actions/<module>.ts` (server actions, `"use server"` at top), `src/lib/queries/<module>.ts` (read helpers; plain functions, no `"use server"`).

## Patterns
- Pages are async server components. Read the user with `requireUser()`; gate officer-only pages with `requirePermission("...")`.
- Server actions: `"use server"` file, zod schema, `parseForm`, permission check via `requirePermissionForAction` or an ownership check, mutate with `db`, `logAudit`, then `revalidatePath(...)` and return `ok("...")` / `fail("...")`. Wrap bodies in `runAction` so thrown errors become `fail`. Signature for forms: `(prev: ActionResult | null, formData: FormData) => Promise<ActionResult>` used with `useActionState`; for simple buttons use `action={async () => { "use server"; ... }}` or bind ids.
- `formToObject` turns empty inputs into `undefined`, so optional fields are simply `.optional()`; a missing required field gets the message "This field is required." automatically. Use `z.coerce.number()` for numeric inputs and `parseDollarsToCents` for money.
- React 19 resets a form's uncontrolled inputs after its action returns. On failure, return `fail(msg, fieldErrors, formValues(formData))` (`parseForm` already does this) and set `defaultValue={fieldValue(result, "name", existing)}` on inputs so users do not lose what they typed. Password fields are never echoed.
- Client components only where interaction needs it (`useActionState`, dialogs, toggles). Keep them small and pass plain data.
- Every list page must handle the empty case with `EmptyState`.
- Mobile first: brothers use phones. Tables wrap in the provided `Table` (horizontal scroll); stack cards on small screens where a table is too wide.
- `searchParams` and `params` are Promises in Next 15: `const { id } = await params`.
- Never trust ids from forms without checking the row exists; return `fail("Not found.")`.
- Use `StatusPill` for any status enum; add tones to `STATUS_TONES` only via the integrator (report new statuses instead).
- Do not add npm dependencies.
- Do not use em dashes in UI copy.
