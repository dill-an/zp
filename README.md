# ZP House

Chapter management app for Zeta Psi at MIT. It replaces the cleans spreadsheet and the house meeting attendance sheet, and adds chair task boards, dues, sanctions, events and more. Built for phones first.

## What it does
- **Dashboard and My week**: every brother lands on their own week: cleans with due days and a Mark done button, open tasks, event duties, sanctions, the next meeting, dues balance, announcements. Officers get a panel with their chairs' open tasks, unfilled slots, unverified cleans, outstanding dues and pending requests. "My week" is the same view as one page.
- **Labor and cleans**: the weekly cleans grid (commons, bathrooms, kitchen shifts), a per-brother view of what everyone is doing each week, mark done / verify / missed, swaps and excuses, fairness stats (who has cleaned fewer than twice), auto-fill that balances the load, job type management.
- **Chairs and tasks**: every officer position with its holder, responsibilities and a task board; tasks with assignees, due dates, checklists, comments, recurrence; "my tasks" for every brother.
- **Dues**: semester periods, one-click billing, payments, balances, late fees, payment plans, CSV export; each brother sees what they owe and by when.
- **Sanctions**: punishment jobs and fines with due dates, completion, verification, waivers and appeals; missed cleans and missed meetings can issue them automatically.
- **Meetings and attendance**: house meetings, taking attendance on a phone, the semester attendance grid, excuse requests, absence fines.
- **Events, announcements, maintenance**: RSVPs, sober monitor and setup duties, a calendar, pinned announcements by audience, house maintenance requests.
- **Roster**: pledge classes, contact info, labor groups (cooks vs cleans), roles and permissions, password resets.
- **Settings**: house settings (chapter name, semester, Venmo handle, meeting time, fine amounts), audit log of every change, one-click database backup.

## Run it locally
Requires Node 22+.

```bash
npm install
npm run setup     # creates data/zp.db, applies migrations, seeds the Fall 2026 roster
npm run dev       # http://localhost:3000
```

The database is a single SQLite file at `data/zp.db` (override with `DATABASE_PATH`). Migrations and the initial seed also run automatically the first time the app opens an empty database, so `npm run dev` alone works too.

### Logins
Every seeded brother has the username `first.last` (for example `dylan.nguyen`, `david.coll-leon`) and the password `zetapsi`. Everyone must set a new password on first login. `dylan.nguyen` is the admin. The roster page lists every username so officers can hand them out.

Roles: admins can do everything; holding a chair grants that chair's permissions (treasurer manages dues, house manager manages labor and sanctions, secretary manages meetings, and so on; see `src/lib/permissions.ts`); every brother can see the schedules, mark their own jobs and tasks done, RSVP, request swaps and excuses, report maintenance, and see their own dues.

## Deploy
Any host that runs Node or Docker and gives you a persistent disk works (a $5 VPS, Fly.io, Railway, a Raspberry Pi in the house).

```bash
docker compose up -d --build
```

This serves the app on port 3000 with the database in a named volume. Set `SESSION_SECRET` to a long random string and put it behind HTTPS (Caddy or the host's proxy). Set `SEED_DEFAULT_PASSWORD` before the first boot if you want a different starting password.

Without Docker: `npm ci && npm run build && npm run start` with `DATABASE_PATH` pointing at a persistent file and `NODE_ENV=production`.

Back up the database from Settings (admin) or by copying `data/zp.db` while the app is stopped.

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm run start` | production build and server |
| `npm run setup` | migrate and seed |
| `npm run db:reset` | wipe and reseed `data/zp.db` |
| `npm run typecheck`, `npm run lint` | checks |
| `npm test` | unit tests (vitest) |
| `npm run test:e2e` | browser tests (Playwright, starts its own production server on a fresh `data/e2e.db`; run `npm run build` first) |

## Project layout
- `src/db/schema.ts` database schema (Drizzle), `drizzle/` migrations, `src/db/seed-data/` the roster, cleans and chairs transcribed from the sheets
- `src/app/(app)/<module>/` pages, `src/lib/actions/<module>.ts` server actions, `src/lib/queries/<module>.ts` reads
- `src/lib/permissions.ts` roles and chair permissions, `src/lib/auth.ts` sessions
- `docs/specs/` the written spec for each module

## Customizing
- Chairs, pledge classes and job types are editable in the app.
- House settings (chapter name, semester, Venmo handle, meeting time, fine amounts) live under Settings.
- The seed is in `src/db/seed-data/`; edit it and run `npm run db:reset` to start a new semester from scratch, or just use the app's own forms.
