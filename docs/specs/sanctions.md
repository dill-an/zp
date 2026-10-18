# Module: sanctions (key `sanctions`, dev port 3106): punishment jobs, fines, standards

Owns `src/app/(app)/sanctions/**`, `src/lib/actions/sanctions.ts`, `src/lib/queries/sanctions.ts`, `src/lib/queries/sanctions-logic.ts` (+ `.test.ts`), `e2e/sanctions.spec.ts`.
Replace the stub at `src/app/(app)/sanctions/page.tsx`. Tables: `sanctions`, `charges` (fine rows linked by `sanctionId`), `settings` (key `sanctions_policy`); reads `members`, `payments`.

The user: "what punishment jobs there are and how many people have done them and who needs to do them at what time and if that has been done."

## Routes
- `/sanctions` (everyone): brothers see "My sanctions": open/in-progress first with reason, job, hours, fine (and whether its charge is covered: compare the member's payments total vs charges total is too loose; just link to `/dues`), issued date, due (`dueDescription`), status pill; actions "Start" (`in_progress`), "Mark completed" (`completed`, `completedAt`), "Appeal" (dialog with reason; status `appealed`, reason appended to notes). Completed-awaiting-verification and verified history below.
  `sanctions.manage` sees the standards board instead (with a link to "My sanctions" at `/sanctions?mine=1`): tabs Open (open + in_progress) / To verify (completed) / Appealed / Verified / Waived / All; filters `member=`, `source=`, `q=`; stats: open count, overdue count, outstanding hours, outstanding fines (sum of linked fine charges for non-waived sanctions); table: member, reason, job, hours, fine, source pill, issued, due, status, actions (Verify, Waive, Reopen, Edit, Delete).
- `/sanctions/new` (`sanctions.manage`; `?member=` and `?source=` preselect): member (MemberSelect grouped), reason, job description, hours, fine dollars (if > 0 insert a `charges` row kind `fine`, `amountCents`, description "Fine: <reason>", `sanctionId`, dueDate = dueAt date, createdById), source, dueAt (datetime-local), notes. Option "Apply to several brothers" (multi-select) creating one sanction each.
- `/sanctions/[id]` (member themself or `sanctions.manage`; others get 404): timeline (issued by/at, started, completed, verified by/at, waived), linked fine charge with amount and a link to `/dues/members/[memberId]`, notes. Actions by role as above plus manager: Verify (status `verified`, `verifiedById`, `verifiedAt`), Reopen (back to `open`), Waive (status `waived`; if a linked fine charge exists add an offsetting `credit` charge with `sanctionId`, negative amount, description "Waived fine: <reason>"), Edit, Delete (ConfirmButton; also delete charges with this `sanctionId`).
- `/sanctions/[id]/edit` (`sanctions.manage`): edit fields; changing the fine amount updates the linked charge (create/delete as needed).
- `/sanctions/policy` (everyone reads; `sanctions.manage` edits): text from `getSetting('sanctions_policy')` (default placeholder "Standards policy not posted yet."), rendered as paragraphs; edit form saves with `setSetting`.

## Logic (`sanctions-logic.ts`, tested)
`isOverdue(sanction, now)`, `sanctionStats(sanctions, fineCharges)`, `filterSanctions(list, tab, filters)`.

## Queries (`sanctions.ts`)
`listSanctions(filters)`, `getSanction(id)` (with member, issuer, verifier, linked charges), `getOpenSanctionsForMember(memberId)`, `getSanctionStats()`.

## Audit
Issue, status changes, verify, waive, delete, policy edits.

## e2e (`e2e/sanctions.spec.ts`)
Admin issues a sanction with a $25 fine to gio.mandwee; Gio sees it under My sanctions with the fine and due date, starts and completes it; admin sees it under To verify and verifies it; admin waives another sanction and the detail shows the waived state; Gio cannot open another brother's sanction (404) or `/sanctions/new` (redirect); policy edit saves; mobile viewport renders the list.
