import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, BROTHER, login, uniq } from "./helpers";

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
const NEW_MEMBER_NAME = "Marcos Arroyo-Cruz";
let periodId = "";
let brotherId = "";
let adminId = "";
let newMemberId = "";

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
