import { test, expect as baseExpect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, uniq } from "./helpers";

/**
 * Dashboard phase: dashboard, My week, settings, audit log, backup. Tests run in order; the
 * labor assignment they rely on is created (or confirmed) by the first test so the suite can run
 * any number of times against the same database.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/** Dev servers compile on first hit; give assertions room. */
const expect = baseExpect.configure({ timeout: 30_000 });

/** Martin's job for the current week (one slot, due Wednesday). */
const JOB = "Upstairs Commons";
const VENMO = uniq("venmo").toLowerCase();

test.beforeEach(async ({ page }) => {
  // Against a dev server, Fast Refresh would reload pages mid-test; a production server has no such socket.
  await page.routeWebSocket(/webpack-hmr|turbopack-hmr/, () => {});
});

async function noHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflows).toBe(false);
}

test("admin dashboard shows the officer panel and house pulse, then assigns Martin a job this week", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening), Dylan/);
  await expect(page.getByTestId("officer-panel")).toBeVisible();
  await expect(page.getByTestId("officer-panel").getByText(/Labor · week of/)).toBeVisible();
  await expect(page.getByTestId("officer-panel").getByText(/outstanding/)).toBeVisible();
  await expect(page.getByTestId("house-pulse")).toBeVisible();
  const pulse = page.getByTestId("house-pulse");
  await expect(pulse.getByText("Labor this week")).toBeVisible();
  await expect(pulse.getByText("Last meeting")).toBeVisible();
  await expect(pulse.getByText("Open maintenance")).toBeVisible();
  await expect(pulse.getByText("Zero cleans")).toBeVisible();
  // Personal cards render for the admin too.
  for (const id of ["my-week-card", "my-tasks-card", "dues-card", "sanctions-card", "next-meeting-card", "events-card", "announcements-card"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }

  // Make sure the current labor week exists, then give Martin a job in it.
  await page.goto("/labor");
  const copy = page.getByRole("button", { name: "Copy last week" });
  if (await copy.isVisible()) {
    await copy.click();
    await expect(copy).toBeHidden();
  }
  await page.goto("/labor?manage=1");
  await expect(page.getByText("Manage this week")).toBeVisible();
  const row = page.locator(`tr[data-job="${JOB}"]`);
  await expect(row).toBeVisible();
  const select = row.locator("select[name=slot_1]");
  const current = (await select.locator("option:checked").textContent())?.trim();
  if (current !== CLEANER.name) {
    await select.selectOption({ label: CLEANER.name });
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("Saved.")).toBeVisible();
  }
});

test("a brother's dashboard shows My week with the assignment, dues and next meeting; My week lists it too", async ({ page }) => {
  await login(page, CLEANER);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Martin");

  const card = page.getByTestId("my-week-card");
  await expect(card).toBeVisible();
  const job = card.getByTestId("my-week-jobs").locator(`li[data-job="${JOB}"]`);
  await expect(job).toBeVisible();
  await expect(job.getByText("Mon-Wed")).toBeVisible();
  const markDone = job.getByRole("button", { name: "Mark done" });
  if (await markDone.count()) {
    await markDone.click();
    await expect(job.getByText("Done", { exact: true })).toBeVisible();
  }
  await expect(job.getByText(/^(Done|Verified)$/)).toBeVisible();
  await expect(job.getByRole("button", { name: "Mark done" })).toHaveCount(0);

  const dues = page.getByTestId("dues-card");
  await expect(dues).toBeVisible();
  await expect(dues.getByTestId("dues-balance")).toContainText("$");
  await expect(dues.getByRole("link", { name: "My dues" })).toHaveAttribute("href", "/dues");

  const meeting = page.getByTestId("next-meeting-card");
  await expect(meeting).toBeVisible();
  await expect(meeting.getByTestId("next-meeting-link")).toHaveAttribute("href", /\/meetings\/\d+$/);
  await expect(meeting.getByText("My attendance this semester")).toBeVisible();

  // No officer panel for a plain brother.
  await expect(page.getByTestId("officer-panel")).toHaveCount(0);
  await expect(page.getByTestId("house-pulse")).toBeVisible();

  // My week: the same job, header counts.
  await page.goto("/my-week");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My week");
  await expect(page.getByTestId("week-summary")).toContainText(/\d+ things? this week, \d+ done/);
  const weekJob = page.getByTestId("week-jobs").locator(`li[data-job="${JOB}"]`);
  await expect(weekJob).toBeVisible();
  await expect(weekJob.getByText(/^(Done|Verified)$/)).toBeVisible();
  await expect(page.getByTestId("week-meetings")).toBeVisible();
  await expect(page.getByTestId("week-next")).toBeVisible();
});

test("admin saves the Venmo handle under house settings and /dues shows it", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.getByTestId("profile-card").getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/settings/password");
  await expect(page.getByTestId("profile-card").getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", /\/members\/\d+\/edit$/);
  await page.fill("#venmoHandle", `@${VENMO}`);
  await page.getByRole("button", { name: "Save house settings" }).click();
  await expect(page.locator("p[role=status]")).toHaveText("Settings saved.");
  await expect(page.locator("#venmoHandle")).toHaveValue(VENMO);

  await page.goto("/dues");
  await expect(page.getByText(`@${VENMO}`)).toBeVisible();
});

test("audit log lists entries newest first and filters by text", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit log");
  const list = page.getByTestId("audit-list");
  await expect(list.locator("li").first()).toBeVisible();
  await expect(page.getByTestId("audit-count")).toContainText(/Showing 1 to \d+ of \d+ entries/);
  await expect(list.getByText(/updated house settings \(.*venmo_handle.*\)/).first()).toBeVisible();

  await page.fill("#q", "house settings");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/\/settings\/audit\?.*q=house\+settings/);
  const filtered = page.getByTestId("audit-list").locator("li");
  const n = await filtered.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(filtered.nth(i)).toContainText("house settings");
  await expect(page.getByRole("link", { name: "Clear" })).toBeVisible();
});

test("backup download responds with the sqlite content type for an admin and 403 for a brother", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/settings");
  await expect(page.getByTestId("data-card").getByRole("link", { name: "Download database backup" })).toHaveAttribute("href", "/settings/backup");
  const res = await page.request.get("/settings/backup");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/x-sqlite3");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="zp-house-\d{4}-\d{2}-\d{2}\.sqlite"/);
  const body = await res.body();
  expect(body.subarray(0, 15).toString("utf8")).toBe("SQLite format 3");

  await page.context().clearCookies();
  await login(page, BROTHER);
  const denied = await page.request.get("/settings/backup");
  expect(denied.status()).toBe(403);
});

test("a plain brother cannot open the audit log or house settings, and the phone layout fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, BROTHER);
  await page.goto("/settings/audit");
  await expect(page).toHaveURL(/\/dashboard\?denied=audit\.view/);
  await expect(page.getByTestId("denied-notice")).toHaveText("You do not have access to audit.view.");
  await noHorizontalOverflow(page);

  await page.goto("/settings");
  await expect(page.getByTestId("profile-card")).toBeVisible();
  await expect(page.locator("#venmoHandle")).toHaveCount(0);
  await expect(page.getByTestId("data-card")).toHaveCount(0);

  await page.goto("/my-week");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My week");
  await noHorizontalOverflow(page);
});
