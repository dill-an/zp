import { test, expect as baseExpect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, login, uniq } from "./helpers";

/**
 * Dues flows. Runs serially: the first test creates a fresh, active period and bills everyone;
 * the later tests act on that period, so the whole file can run again and again without colliding.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });
test.use({ actionTimeout: 60_000, navigationTimeout: 120_000 });
const expect = baseExpect.configure({ timeout: 30_000 });

const periodName = uniq("E2E Dues");
let periodId = "";
let brotherId = "";
let adminId = "";

function openDialog(page: Page) {
  return page.locator("dialog[open]");
}

test("admin creates an active period at $850 and bills members (preview, then confirm)", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/dues/periods");
  await page.getByRole("button", { name: "New period" }).click();
  const dialog = openDialog(page);
  await dialog.locator("#period-new-name").fill(periodName);
  await dialog.locator("#period-new-amount").fill("850");
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
  const confirm = page.getByTestId("run-confirm");
  await expect(confirm).toBeEnabled();
  await expect(confirm).toContainText("Bill");

  // Confirm
  await confirm.click();
  await page.waitForURL(new RegExp(`/dues\\?period=${periodId}&billed=\\d+`), { waitUntil: "commit" });
  await expect(page.getByTestId("bill-notice")).toContainText("Billed");
  await expect(page.getByTestId(`member-row-${await memberIdFor(page, BROTHER.name)}`)).toContainText("Unpaid");

  // The admin's own "Full ledger" link tells us the admin id for the permission test later.
  const ledgerHref = await page.getByRole("link", { name: "Full ledger" }).getAttribute("href");
  adminId = ledgerHref?.split("/").pop() ?? "";
  expect(adminId).not.toBe("");
});

async function memberIdFor(page: Page, name: string): Promise<string> {
  const href = await page.locator("tr", { hasText: name }).first().getByRole("link", { name }).getAttribute("href");
  return href?.split("/").pop() ?? "";
}

test("a brother sees the new charge as unpaid on /dues", async ({ page }) => {
  await login(page, BROTHER);
  await page.goto("/dues");
  await expect(page.getByTestId("my-balance")).toBeVisible();
  const row = page.getByTestId(`period-row-${periodId}`);
  await expect(row).toContainText(periodName);
  await expect(row).toContainText("Unpaid");
  await expect(row).toContainText("$850.00");
  await expect(row).toContainText("Dec 1, 2026");
  await expect(page.locator("tr", { hasText: `${periodName} dues` })).toBeVisible();
  const href = await page.getByRole("link", { name: "Full ledger" }).getAttribute("href");
  brotherId = href?.split("/").pop() ?? "";
  expect(brotherId).not.toBe("");
  // The brother cannot bill, apply fees or export.
  await expect(page.getByRole("link", { name: "Bill members" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
});

test("admin records a partial payment and the brother's status becomes partial", async ({ page }) => {
  await login(page, ADMIN);
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

  await login(page, BROTHER);
  await page.goto("/dues");
  await expect(page.getByTestId(`period-row-${periodId}`)).toContainText("Partial");
});

test("a full payment makes it paid, and a credit charge shows on the ledger", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(`/dues/members/${brotherId}`);
  await page.getByRole("button", { name: "Record payment" }).click();
  let dialog = openDialog(page);
  await dialog.locator(`#payment-new-${brotherId}-amount`).fill("450");
  await dialog.locator(`#payment-new-${brotherId}-period`).selectOption(periodId);
  await dialog.locator(`#payment-new-${brotherId}-method`).selectOption("cash");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto(`/dues?period=${periodId}`);
  await expect(page.getByTestId(`member-row-${brotherId}`)).toContainText("Paid");

  // Credit (negative charge)
  const creditNote = uniq("Cooked for rush");
  await page.goto(`/dues/members/${brotherId}`);
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

  await login(page, BROTHER);
  await page.goto("/dues");
  const row = page.getByTestId(`period-row-${periodId}`);
  await expect(row).toContainText("Paid");
  await expect(row).toContainText("$25.00 credit");
});

test("CSV export returns text/csv with the brother's row", async ({ page }) => {
  await login(page, ADMIN);
  const res = await page.request.get(`/dues/export?period=${periodId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body.split(/\r?\n/)[0]).toBe("Name,Username,Pledge class,Charged,Paid,Balance,Status,Last payment");
  const brotherLine = body.split(/\r?\n/).find((l) => l.includes(BROTHER.username));
  expect(brotherLine).toBeTruthy();
  expect(brotherLine).toContain("825.00,850.00,-25.00,Paid");
});

test("a plain brother cannot open another ledger or the periods page", async ({ page }) => {
  await login(page, BROTHER);
  await page.goto(`/dues/members/${adminId}`);
  await expect(page).toHaveURL(/\/dues$/);
  await page.goto("/dues/periods");
  await expect(page).toHaveURL(/\/dashboard\?denied=dues\.manage/);
  await page.goto("/dues/plans");
  await expect(page).toHaveURL(/\/dashboard\?denied=dues\.manage/);
  const res = await page.request.get(`/dues/export?period=${periodId}`);
  expect(res.status()).toBe(403);
  // Their own ledger is fine.
  await page.goto(`/dues/members/${brotherId}`);
  await expect(page.getByRole("heading", { name: BROTHER.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
});

test("mobile viewport renders /dues without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, BROTHER);
  await page.goto("/dues");
  await expect(page.getByTestId("my-balance")).toBeVisible();
  await expect(page.getByTestId(`period-row-${periodId}`)).toBeVisible();
  await expect(page.getByText("How to pay")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
