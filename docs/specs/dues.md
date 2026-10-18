# Module: dues (key `dues`, dev port 3104)

Owns `src/app/(app)/dues/**`, `src/lib/actions/dues.ts`, `src/lib/queries/dues.ts`, `src/lib/queries/dues-logic.ts` (+ `.test.ts`), `e2e/dues.spec.ts`.
Replace the stub at `src/app/(app)/dues/page.tsx`. Tables: `dues_periods`, `charges`, `payments`, `payment_plans`; reads `members`, `pledge_classes`, `sanctions`. Money is integer cents; use `formatCents`, `parseDollarsToCents`, `centsToInput` from `src/lib/money.ts`.

The user: "track who has paid dues, how much is due, and when they're due by."

## Balance model
Balance for a member = sum(`charges.amountCents`) - sum(`payments.amountCents`) (optionally restricted to a period; charges/payments with null period count in "all"). Credits are negative charges. Status for a member and period: `paid` (balance <= 0 and something was charged), `partial` (0 < balance < charged), `unpaid` (balance == charged > 0), `overdue` (balance > 0 and the earliest unpaid charge's dueDate < today), `none` (nothing charged).

## Routes
- `/dues` (everyone): "My dues": balance (big number, tone by status), status pill, per-period rows, my charges table (date, kind pill, description, amount, due), my payments table (date, method, amount, reference), my payment plan if any, "How to pay" card: Venmo handle from `getSetting(SETTING_KEYS.venmoHandle)` (fallback text "Ask the treasurer") and "put your name and the semester in the memo".
  For `dues.manage` a treasurer dashboard renders above: period selector (`?period=<id>`, default `getActivePeriod()`), stats (billed, collected, outstanding, paid in full count, overdue count), members table (name, pledge class, charged, paid, balance, status pill, next due, actions: Record payment, Add charge, Ledger), filters: `status=all|unpaid|partial|paid|overdue`, `class=`, `q=`; buttons: Bill members, Apply late fees, Export CSV (`/dues/export?period=`), Periods, Plans.
- `/dues/members/[memberId]` (self or `dues.manage`): ledger: chronological rows of charges (+) and payments (-) with running balance, grouped or filterable by period; payment plan card. `dues.manage` actions (dialogs or inline forms): Record payment (amount dollars, method, paidAt date default today, reference, notes, period select), Add charge (kind, description, amount dollars, negative allowed = credit, dueDate, period), edit and delete a charge or payment (ConfirmButton), Create payment plan (3 to 6 rows of date + amount, must sum to the current period balance; stored as `installmentsJson`; status `proposed`), Approve / cancel plan.
- `/dues/periods` (`dues.manage`): periods list with billed/collected; create/edit (name, amount dollars, new member amount dollars optional, dueDate, lateFee dollars, isActive, notes); only one active period at a time (activating one deactivates others). "Bill members" two-step: GET `/dues/periods/[id]/bill` shows who will be billed (active, new_member and abroad members without a `dues` charge for the period; new members get `newMemberAmountCents` when set) and the total; POST creates the charges (description "<period name> dues", dueDate = period.dueDate, createdById me). Refuse when `amountCents` is 0 with a clear message. "Apply late fees" two-step similarly: members with a positive period balance after dueDate and no `late_fee` charge for the period get one of `lateFeeCents`.
- `/dues/export` (`dues.manage`): CSV: name, username, pledge class, charged, paid, balance, status, last payment date, for the selected period or all.
- `/dues/plans` (`dues.manage`): plans with member, period, next installment, status; approve, mark completed/defaulted, cancel.

## Logic (`dues-logic.ts`, tested)
`computeBalance(charges, payments, periodId?)`, `memberStatus({ chargedCents, balanceCents, earliestUnpaidDue }, today)`, `nextInstallment(installments, paidCents, today)`, `parseInstallments(formRows)`, `csvEscape`.

## Queries (`dues.ts`)
`getActivePeriod()`, `listPeriods()`, `getMemberBalance(memberId, periodId?)` -> `{ chargedCents, paidCents, balanceCents, status, nextDueDate }`, `getBalances(periodId?)` for all current members, `getMemberLedger(memberId)`, `getPeriodStats(periodId)`.

## Audit
Billing runs, late fees, payments, charges, plan changes, deletions.

## e2e (`e2e/dues.spec.ts`)
Admin sets the Fall 2026 amount (e.g. $850) and bills members (preview then confirm), a brother sees their balance and status unpaid on `/dues`, admin records a partial payment and the brother's status becomes partial, a full payment makes it paid, add a credit charge, CSV export returns text/csv, plain brother cannot open another member's ledger (redirect) nor `/dues/periods`, mobile viewport renders `/dues`.
