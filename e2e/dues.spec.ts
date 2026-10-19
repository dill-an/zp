import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, uniq } from "./helpers";

/**
 * Dues flows. Runs serially: the first test creates a fresh, active period and bills everyone;
 * the later tests act on that period, so the whole file can run again and again without colliding.
 * The admin and the brother each log in once (shared contexts) because every navigation is expensive on a dev server.
 */
test.describe.configure({ mode: "serial" });
// Tracing is off because the admin and brother contexts outlive individual tests (retain-on-failure would delete their trace files mid-run).
test.use({ actionTimeout: 60_000, navigationTimeout: 120_000, trace: "off" });
const expect = baseExpect.configure({ timeout: 60_000 });

const periodName = uniq("E2E Dues");
/** Seeded new member (Beta Beta); the period bills new members $0, so he is skipped. */
const NEW_MEMBER = { username: "marcos.arroyo-cruz", password: "zetapsi", name: "Marcos Arroyo-Cruz" };
const NEW_MEMBER_NAME = NEW_MEMBER.name;
let periodId = "";
let brotherId = "";
let adminId = "";
let newMemberId = "";
let cleanerId = "";
/** A second, already past-due period for the late-fee test. */
const pastPeriodName = uniq("E2E Past Dues");
let pastPeriodId = "";

let adminCtx: BrowserContext;
let brotherCtx: BrowserContext;
let admin: Page;
let brother: Page;

async function loggedInPage(browser: Browser, user: { username: string; password: string }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(60_000);
  await login(page, user);
  return { ctx, page };
}

test.beforeAll(async ({ browser }) => {
  ({ ctx: adminCtx, page: admin } = await loggedInPage(browser, ADMIN));
  ({ ctx: brotherCtx, page: brother } = await loggedInPage(browser, BROTHER));
  // Delete buttons ask with window.confirm.
  admin.on("dialog", (d) => d.accept());
});

test.afterAll(async () => {
  await adminCtx?.close();
  await brotherCtx?.close();
});

const openDialog = (page: Page) => page.locator("dialog[open]");

async function memberIdFor(page: Page, name: string): Promise<string> {
  const href = await page.locator("tr", { hasText: name }).first().getByRole("link", { name }).getAttribute("href");
  return href?.split("/").pop() ?? "";
}

test("admin creates an active period at $850 and bills members (preview, then confirm)", async () => {
  const page = admin;
  await page.goto("/dues/periods");
  await page.getByRole("button", { name: "New period" }).click();
  const dialog = openDialog(page);
  await dialog.locator("#period-new-name").fill(periodName);
  await dialog.locator("#period-new-amount").fill("850");
  await dialog.locator("#period-new-newMemberAmount").fill("0");
  await dialog.locator("#period-new-dueDate").fill("2026-12-01");
  await dialog.locator("#period-new-lateFee").fill("25");
  await dialog.getByRole("button", { name: "Create period" }).click();
  await expect(dialog).toHaveCount(0);

  const row = page.locator("tr", { hasText: periodName }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("$850.00");
  await expect(row).toContainText("Active");
  const billHref = await row.getByRole("link", { name: "Bill members" }).getAttribute("href");
  periodId = billHref?.match(/periods\/(\d+)\/bill/)?.[1] ?? "";
  expect(periodId).not.toBe("");

  // Preview
  await page.goto(`/dues/periods/${periodId}/bill`);
  await expect(page.getByRole("heading", { name: periodName })).toBeVisible();
  await expect(page.getByText(BROTHER.name)).toBeVisible();
  // New members come to $0 for this period: listed as skipped, not in the table, and no $0 charge is created.
  await expect(page.getByTestId("bill-skipped")).toContainText(NEW_MEMBER_NAME);
  await expect(page.locator("table tr", { hasText: NEW_MEMBER_NAME })).toHaveCount(0);
  const confirm = page.getByTestId("run-confirm");
  await expect(confirm).toBeEnabled();
  await expect(confirm).toContainText("Bill");

  // Confirm
  await confirm.click();
  await page.waitForURL(new RegExp(`/dues\\?period=${periodId}&billed=\\d+`), { waitUntil: "commit" });
  await expect(page.getByTestId("bill-notice")).toContainText("Billed");
  brotherId = await memberIdFor(page, BROTHER.name);
  expect(brotherId).not.toBe("");
  await expect(page.getByTestId(`member-row-${brotherId}`)).toContainText("Unpaid");
  newMemberId = await memberIdFor(page, NEW_MEMBER_NAME);
  expect(newMemberId).not.toBe("");
  await expect(page.getByTestId(`member-row-${newMemberId}`)).toContainText("Nothing due");
  cleanerId = await memberIdFor(page, CLEANER.name);
  expect(cleanerId).not.toBe("");

  // The admin's own "Full ledger" link gives the admin id for the permission test later.
  const ledgerHref = await page.getByRole("link", { name: "Full ledger" }).getAttribute("href");
  adminId = ledgerHref?.split("/").pop() ?? "";
  expect(adminId).not.toBe("");
});

test("a brother sees the new charge as unpaid on /dues", async () => {
  const page = brother;
  await page.goto("/dues");
  await expect(page.getByTestId("my-balance")).toBeVisible();
  const row = page.getByTestId(`period-row-${periodId}`);
  await expect(row).toContainText(periodName);
  await expect(row).toContainText("Unpaid");
  await expect(row).toContainText("$850.00");
  await expect(row).toContainText("Dec 1, 2026");
  await expect(page.locator("tr", { hasText: `${periodName} dues` })).toBeVisible();
  const href = await page.getByRole("link", { name: "Full ledger" }).getAttribute("href");
  expect(href?.split("/").pop()).toBe(brotherId);
  // No treasurer controls for a plain brother.
  await expect(page.getByRole("link", { name: "Bill members" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
});

test("a fine due before the dues is named as a fine in the brother's headline", async ({ browser }) => {
  // Billed by hand to the new member, whom billing skips ($0 new member amount) and the sanctions suite never fines,
  // so the headline holds exactly these items on every run. Both charges are removed again at the end.
  const page = admin;
  const duesNote = uniq(`${periodName} dues`);
  const fineNote = uniq("Fine: Missed clean");
  const c = `#charge-new-${newMemberId}`;
  await page.goto(`/dues/members/${newMemberId}?period=${periodId}`);
  for (const charge of [
    { kind: "dues", amount: "850", description: duesNote, dueDate: "2026-12-01" },
    { kind: "fine", amount: "25", description: fineNote, dueDate: "2026-10-23" },
  ]) {
    await page.getByRole("button", { name: "Add charge" }).click();
    const dialog = openDialog(page);
    await dialog.locator(`${c}-kind`).selectOption(charge.kind);
    await dialog.locator(`${c}-amount`).fill(charge.amount);
    await dialog.locator(`${c}-description`).fill(charge.description);
    await dialog.locator(`${c}-dueDate`).fill(charge.dueDate);
    await dialog.locator(`${c}-period`).selectOption(periodId);
    await dialog.getByRole("button", { name: "Add charge" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("tr", { hasText: charge.description })).toBeVisible();
  }

  // The headline names the fine first and keeps the dues as their own item with their own date, instead of
  // "Due Oct 23" reading as if the semester's dues were due then.
  const { ctx, page: newMember } = await loggedInPage(browser, NEW_MEMBER);
  await newMember.goto("/dues");
  const line = newMember.getByTestId("my-due-line");
  await expect(line).toContainText("$25.00 fine due Oct 23");
  await expect(line).toContainText(`$850.00 ${duesNote} due Dec 1`);
  const text = (await line.textContent()) ?? "";
  expect(text.indexOf("$25.00 fine")).toBeLessThan(text.indexOf(`$850.00 ${duesNote}`));

  // Without the fine the line is the dues alone; then the dues go too so nothing is left behind for the next run.
  await page.locator("tr", { hasText: fineNote }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tr", { hasText: fineNote })).toHaveCount(0);
  await newMember.goto("/dues");
  await expect(line).toContainText(`$850.00 ${duesNote} due Dec 1`);
  await expect(line).not.toContainText("fine");
  await page.locator("tr", { hasText: duesNote }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tr", { hasText: duesNote })).toHaveCount(0);
  await ctx.close();
});

test("a failed submit keeps what the treasurer typed, including the selects", async () => {
  const page = admin;
  await page.goto(`/dues/members/${brotherId}?period=${periodId}`);

  // Record payment: a $0 amount is rejected by the action body (not by parseForm); nothing may be wiped.
  await page.getByRole("button", { name: "Record payment" }).click();
  let dialog = openDialog(page);
  const p = `#payment-new-${brotherId}`;
  const reference = uniq("CASH");
  await dialog.locator(`${p}-amount`).fill("0");
  await dialog.locator(`${p}-method`).selectOption("cash");
  await dialog.locator(`${p}-period`).selectOption("");
  await dialog.locator(`${p}-paidAt`).fill("2026-10-02");
  await dialog.locator(`${p}-reference`).fill(reference);
  await dialog.locator(`${p}-notes`).fill("paid at chapter");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog.getByRole("alert")).toContainText("more than $0");
  await expect(dialog.locator(`${p}-amount`)).toHaveValue("0");
  await expect(dialog.locator(`${p}-method`)).toHaveValue("cash");
  await expect(dialog.locator(`${p}-period`)).toHaveValue("");
  await expect(dialog.locator(`${p}-paidAt`)).toHaveValue("2026-10-02");
  await expect(dialog.locator(`${p}-reference`)).toHaveValue(reference);
  await expect(dialog.locator(`${p}-notes`)).toHaveValue("paid at chapter");
  // A parseForm failure on the second try keeps the selects too (React only applies a select's default on mount).
  await dialog.locator(`${p}-amount`).fill("12.345");
  await dialog.locator(`${p}-method`).selectOption("check");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter the amount paid");
  await expect(dialog.locator(`${p}-amount`)).toHaveValue("12.345");
  await expect(dialog.locator(`${p}-method`)).toHaveValue("check");
  await expect(dialog.locator(`${p}-period`)).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // Add charge: $0 is rejected; kind, description and period stay.
  await page.getByRole("button", { name: "Add charge" }).click();
  dialog = openDialog(page);
  const c = `#charge-new-${brotherId}`;
  await dialog.locator(`${c}-kind`).selectOption("damage");
  await dialog.locator(`${c}-amount`).fill("0");
  await dialog.locator(`${c}-description`).fill("Keg deposit");
  await dialog.locator(`${c}-period`).selectOption("");
  await dialog.getByRole("button", { name: "Add charge" }).click();
  await expect(dialog.getByRole("alert")).toContainText("cannot be $0");
  await expect(dialog.locator(`${c}-kind`)).toHaveValue("damage");
  await expect(dialog.locator(`${c}-amount`)).toHaveValue("0");
  await expect(dialog.locator(`${c}-description`)).toHaveValue("Keg deposit");
  await expect(dialog.locator(`${c}-period`)).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // Payment plan: installments that do not add up to the balance keep every row and the notes.
  await page.getByRole("button", { name: "Payment plan" }).click();
  dialog = openDialog(page);
  await dialog.locator("#plan-period").selectOption(periodId);
  const rows: [number, string, string][] = [
    [1, "2026-11-01", "100"],
    [2, "2026-11-02", "100"],
    [3, "2026-11-03", "100"],
  ];
  for (const [n, date, amount] of rows) {
    await dialog.locator(`input[name=due_${n}]`).fill(date);
    await dialog.locator(`input[name=amount_${n}]`).fill(amount);
  }
  await dialog.locator("#plan-notes").fill("talked at the meeting");
  await dialog.getByRole("button", { name: "Propose plan" }).click();
  await expect(dialog.getByRole("alert")).toContainText("add up to $300.00 but the balance is $850.00");
  await expect(dialog.locator("#plan-period")).toHaveValue(periodId);
  for (const [n, date, amount] of rows) {
    await expect(dialog.locator(`input[name=due_${n}]`)).toHaveValue(date);
    await expect(dialog.locator(`input[name=amount_${n}]`)).toHaveValue(amount);
  }
  await expect(dialog.locator("#plan-notes")).toHaveValue("talked at the meeting");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  // Nothing was recorded for this period.
  await expect(page.locator("[data-testid^=ledger-payment-]")).toHaveCount(0);
  await expect(page.locator("[data-testid^=ledger-charge-]")).toHaveCount(1);
});

test("admin records a partial payment and the brother's status becomes partial", async () => {
  const page = admin;
  await page.goto(`/dues/members/${brotherId}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = openDialog(page);
  await dialog.locator(`#payment-new-${brotherId}-amount`).fill("400");
  await dialog.locator(`#payment-new-${brotherId}-period`).selectOption(periodId);
  await dialog.locator(`#payment-new-${brotherId}-reference`).fill(uniq("venmo"));
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-testid^=ledger-payment-]").first()).toContainText("$400.00");

  // The charge was billed today and the payment is dated today: the ledger (newest first) still keeps the payment
  // after the charge it pays for, so the balance after each row is 850 then 450, never a negative number.
  await page.goto(`/dues/members/${brotherId}?period=${periodId}`);
  const ledgerRows = page.locator("tbody tr[data-testid^=ledger-]");
  await expect(ledgerRows).toHaveCount(2);
  await expect(ledgerRows.first()).toHaveAttribute("data-testid", /^ledger-payment-/);
  await expect(ledgerRows.first()).toContainText("$450.00");
  await expect(ledgerRows.nth(1)).toHaveAttribute("data-testid", /^ledger-charge-/);
  await expect(ledgerRows.nth(1)).toContainText("$850.00");
  await expect(page.locator("tbody")).not.toContainText("credit");

  await page.goto(`/dues?period=${periodId}`);
  const row = page.getByTestId(`member-row-${brotherId}`);
  await expect(row).toContainText("Partial");
  await expect(row).toContainText("$450.00");

  await brother.goto("/dues");
  await expect(brother.getByTestId(`period-row-${periodId}`)).toContainText("Partial");
});

test("a full payment makes it paid, and a credit charge shows on the ledger", async () => {
  const page = admin;
  await page.goto(`/dues/members/${brotherId}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  let dialog = openDialog(page);
  await dialog.locator(`#payment-new-${brotherId}-amount`).fill("450");
  await dialog.locator(`#payment-new-${brotherId}-period`).selectOption(periodId);
  await dialog.locator(`#payment-new-${brotherId}-method`).selectOption("cash");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-testid^=ledger-payment-]").first()).toContainText("$450.00");

  // Credit (negative charge)
  const creditNote = uniq("Cooked for rush");
  await page.getByRole("button", { name: "Add charge" }).click();
  dialog = openDialog(page);
  await dialog.locator(`#charge-new-${brotherId}-kind`).selectOption("credit");
  await dialog.locator(`#charge-new-${brotherId}-amount`).fill("-25");
  await dialog.locator(`#charge-new-${brotherId}-description`).fill(creditNote);
  await dialog.locator(`#charge-new-${brotherId}-period`).selectOption(periodId);
  await dialog.getByRole("button", { name: "Add charge" }).click();
  await expect(dialog).toHaveCount(0);
  const creditRow = page.locator("tr", { hasText: creditNote });
  await expect(creditRow).toBeVisible();
  await expect(creditRow).toContainText("Credit");
  await expect(creditRow).toContainText("-$25.00");

  await page.goto(`/dues?period=${periodId}`);
  await expect(page.getByTestId(`member-row-${brotherId}`)).toContainText("Paid");

  // The "N of M brothers" line counts the rows the status filter leaves, not everyone.
  await page.goto(`/dues?period=${periodId}&status=paid`);
  await expect(page.getByTestId(`member-row-${brotherId}`)).toBeVisible();
  await expect(page.getByTestId(`member-row-${cleanerId}`)).toHaveCount(0);
  const shown = await page.locator("[data-testid^=member-row-]").count();
  const countLine = (await page.getByTestId("member-count").textContent()) ?? "";
  const [, n, m] = countLine.match(/^(\d+) of (\d+) brothers$/) ?? [];
  expect(Number(n)).toBe(shown);
  expect(Number(m)).toBeGreaterThan(shown);

  await brother.goto("/dues");
  const row = brother.getByTestId(`period-row-${periodId}`);
  await expect(row).toContainText("Paid");
  await expect(row).toContainText("$25.00 credit");
});

test("CSV export returns text/csv with the brother's row", async () => {
  const res = await admin.request.get(`/dues/export?period=${periodId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const lines = (await res.text()).split(/\r?\n/);
  expect(lines[0]).toBe("Name,Username,Pledge class,Charged,Paid,Balance,Status,Last payment");
  const brotherLine = lines.find((l) => l.includes(BROTHER.username));
  expect(brotherLine).toBeTruthy();
  expect(brotherLine).toContain("825.00,850.00,-25.00,Paid");
});

test("a plain brother cannot open another ledger, the periods page, plans or the export", async () => {
  const page = brother;
  await page.goto(`/dues/members/${adminId}`);
  await expect(page).toHaveURL(/\/dues$/);
  await page.goto("/dues/periods");
  await expect(page).toHaveURL(/\/dashboard\?denied=dues\.manage/);
  await page.goto("/dues/plans");
  await expect(page).toHaveURL(/\/dashboard\?denied=dues\.manage/);
  const res = await page.request.get(`/dues/export?period=${periodId}`);
  expect(res.status()).toBe(403);
  // Their own ledger is fine, without treasurer actions.
  await page.goto(`/dues/members/${brotherId}`);
  await expect(page.getByRole("heading", { name: BROTHER.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
});

test("editing the period's due date moves the billed dues charges with it", async () => {
  const page = admin;
  await page.goto("/dues/periods");
  await page.locator("tr", { hasText: periodName }).first().getByRole("button", { name: "Edit" }).click();
  const dialog = openDialog(page);
  await expect(dialog.getByText("also moves the due date of dues charges")).toBeVisible();
  await dialog.locator(`#period-${periodId}-dueDate`).fill("2026-12-15");
  await dialog.getByRole("button", { name: "Save period" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tr", { hasText: periodName }).first()).toContainText("Dec 15, 2026");

  await brother.goto("/dues");
  const chargeRow = brother.locator("tr", { hasText: `${periodName} dues` });
  await expect(chargeRow).toBeVisible();
  await expect(chargeRow).toContainText("Dec 15");
});

test("late fees skip a brother whose approved payment plan is not late yet", async () => {
  // A second, past-due period: everyone billed in it is overdue, except the brother once he is on an approved plan
  // whose next installment is still ahead. Late fees must follow that same status, not just "balance > 0".
  const page = admin;
  await page.goto("/dues/periods");
  await page.getByRole("button", { name: "New period" }).click();
  let dialog = openDialog(page);
  await dialog.locator("#period-new-name").fill(pastPeriodName);
  await dialog.locator("#period-new-amount").fill("850");
  await dialog.locator("#period-new-newMemberAmount").fill("0");
  await dialog.locator("#period-new-dueDate").fill("2026-10-01");
  await dialog.locator("#period-new-lateFee").fill("25");
  await dialog.locator("input[name=isActive]").uncheck();
  await dialog.getByRole("button", { name: "Create period" }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.locator("tr", { hasText: pastPeriodName }).first();
  const billHref = await row.getByRole("link", { name: "Bill members" }).getAttribute("href");
  pastPeriodId = billHref?.match(/periods\/(\d+)\/bill/)?.[1] ?? "";
  expect(pastPeriodId).not.toBe("");
  await page.goto(`/dues/periods/${pastPeriodId}/bill`);
  await page.getByTestId("run-confirm").click();
  await page.waitForURL(new RegExp(`/dues\\?period=${pastPeriodId}&billed=\\d+`), { waitUntil: "commit" });
  await expect(page.getByTestId(`member-row-${brotherId}`)).toContainText("Overdue");

  // Propose a plan with every installment in the future, then approve it.
  await page.goto(`/dues/members/${brotherId}?period=${pastPeriodId}`);
  await page.getByRole("button", { name: "Payment plan" }).click();
  dialog = openDialog(page);
  await dialog.locator("#plan-period").selectOption(pastPeriodId);
  const rows: [number, string, string][] = [
    [1, "2027-01-15", "200"],
    [2, "2027-02-15", "200"],
    [3, "2027-03-15", "450"],
  ];
  for (const [n, date, amount] of rows) {
    await dialog.locator(`input[name=due_${n}]`).fill(date);
    await dialog.locator(`input[name=amount_${n}]`).fill(amount);
  }
  await dialog.getByRole("button", { name: "Propose plan" }).click();
  await expect(dialog).toHaveCount(0);
  const plan = page.locator("[data-testid^=plan-]", { hasText: pastPeriodName }).first();
  await expect(plan).toContainText("Proposed");
  await plan.getByRole("button", { name: "Approve" }).click();
  await expect(plan).toContainText("Approved");
  await expect(plan).toContainText("next");

  // The dashboard now calls him unpaid with the installment as the next due date, and the late fee preview agrees.
  await page.goto(`/dues?period=${pastPeriodId}`);
  const memberRow = page.getByTestId(`member-row-${brotherId}`);
  await expect(memberRow).toContainText("Unpaid");
  await expect(memberRow).toContainText("Jan 15");
  await expect(memberRow).not.toContainText("Overdue");
  await page.goto(`/dues/periods/${pastPeriodId}/late-fees`);
  await expect(page.getByTestId("late-fee-not-yet-due")).toContainText(BROTHER.name);
  await expect(page.getByTestId("late-fee-not-yet-due")).toContainText("Jan 15");
  await expect(page.locator("table tr", { hasText: BROTHER.name })).toHaveCount(0);
  await expect(page.locator("table tr", { hasText: CLEANER.name })).toHaveCount(1);
  const confirm = page.getByTestId("run-confirm");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await page.waitForURL(new RegExp(`/dues\\?period=${pastPeriodId}&status=overdue&latefees=\\d+`), { waitUntil: "commit" });
  await expect(page.getByTestId("late-fee-notice")).toContainText("Applied late fees");
  // Overdue filter: the cleaner got his fee, the brother on the plan is not in the list at all.
  await expect(page.getByTestId(`member-row-${cleanerId}`)).toContainText("Overdue");
  await expect(page.getByTestId(`member-row-${brotherId}`)).toHaveCount(0);
  // His ledger for the period has the dues charge only, no late fee.
  await page.goto(`/dues/members/${brotherId}?period=${pastPeriodId}`);
  await expect(page.locator("[data-testid^=ledger-charge-]")).toHaveCount(1);
  await expect(page.getByText(`${pastPeriodName} late fee`)).toHaveCount(0);
  // Everyone else got exactly one.
  await page.goto(`/dues/members/${cleanerId}?period=${pastPeriodId}`);
  await expect(page.locator("tr", { hasText: `${pastPeriodName} late fee` })).toHaveCount(1);
});

test("mobile viewport renders /dues without horizontal scroll", async () => {
  const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const page = await brotherCtx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dues");
  await expect(page.getByTestId("my-balance")).toBeVisible();
  await expect(page.getByTestId(`period-row-${periodId}`)).toBeVisible();
  await expect(page.getByText("How to pay")).toBeVisible();
  // The charges and payments tables are what used to push the page wider than the phone.
  await expect(page.locator("tr", { hasText: `${periodName} dues` })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Cash" }).first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.goto(`/dues/members/${brotherId}`);
  await expect(page.getByRole("heading", { name: BROTHER.name })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.close();

  // The treasurer dashboard on a phone: no overflow, and each brother card offers Pay and Charge, not only Ledger.
  const adminPage = await adminCtx.newPage();
  adminPage.setDefaultNavigationTimeout(120_000);
  adminPage.setDefaultTimeout(60_000);
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.goto(`/dues?period=${periodId}`);
  const card = adminPage.getByTestId(`member-card-${brotherId}`);
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Pay" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Charge" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Ledger" })).toBeVisible();
  await expect(adminPage.getByTestId("my-balance")).toBeVisible();
  expect(await overflow(adminPage)).toBeLessThanOrEqual(0);
  await card.getByRole("button", { name: "Pay" }).click();
  await expect(openDialog(adminPage)).toContainText(`Record payment from ${BROTHER.name}`);
  await adminPage.close();
});
