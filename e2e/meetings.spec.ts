import { test, expect as baseExpect, type Browser, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, uniq } from "./helpers";

/**
 * Meetings module: meetings list, taking attendance, the semester grid, excuses and absence fines.
 * The shared dev box runs several dev servers at once, so timeouts are generous and navigation
 * retries when the dev server serves a half-written manifest (a transient 500).
 */
test.setTimeout(420_000);
test.describe.configure({ retries: 1 });
test.use({ actionTimeout: 90_000, navigationTimeout: 180_000 });
const expect = baseExpect.configure({ timeout: 90_000 });

async function go(page: Page, url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await page.goto(url, { waitUntil: "load" }).catch(() => null);
    if (res && res.status() < 500) return res;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Could not load ${url}`);
}

/**
 * The dev server on the shared box recompiles every second (seven dev servers watch each other's
 * dist dirs), and the HMR client turns each rebuild into hot-update fetches plus a server-component
 * refresh until the tab runs out of memory. Muting the HMR socket keeps the tab stable; against a
 * production server the route never matches.
 */
const muted = new WeakSet<Page>();
async function quietHmr(page: Page) {
  if (muted.has(page)) return;
  muted.add(page);
  await page.routeWebSocket(/_next\/webpack-hmr/, () => {});
}

/** Is a session cookie in place? (/login redirects to /dashboard when logged in.) */
async function isLoggedIn(page: Page): Promise<boolean> {
  const res = await page.goto("/login", { waitUntil: "commit" }).catch(() => null);
  return !!res && res.status() < 500 && !page.url().includes("/login");
}

/**
 * login() from the shared helpers, plus recovery for a slow or flaky dev server: the helper gives the
 * dashboard 5 seconds to render, which a loaded box can miss even though the session cookie is set.
 */
async function signIn(page: Page, user: { username: string; password: string }) {
  await quietHmr(page);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await login(page, user);
      return;
    } catch {
      if (await isLoggedIn(page)) return;
    }
  }
  throw new Error(`Could not log in as ${user.username}`);
}

async function newPage(browser: Browser, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  return { ctx, page: await ctx.newPage() };
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, N days from now at 19:00. */
function localInput(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T19:00`;
}

/** Admin creates a single meeting and returns its id (reads it from the redirect URL). */
async function createMeeting(page: Page, title: string, daysFromNow: number): Promise<number> {
  await go(page, "/meetings/new");
  await page.fill("#title", title);
  await page.fill("#scheduledAt", localInput(daysFromNow));
  await page.fill("#location", "Chapter room");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await page.waitForURL(/\/meetings\/\d+$/);
  await expect(page.locator("h1")).toHaveText(title);
  return Number(page.url().match(/\/meetings\/(\d+)/)![1]);
}

/** On the take-attendance sheet: everyone present except `absentName`, then save. */
async function takeAttendance(page: Page, meetingId: number, absentName: string) {
  await go(page, `/meetings/${meetingId}/attendance`);
  await expect(page.getByRole("button", { name: "Mark everyone present" })).toBeVisible();
  await page.getByRole("button", { name: "Mark everyone present" }).click();
  const row = page.locator("li[data-member-id]", { hasText: absentName });
  await row.locator('label[title="Absent"]').click();
  await expect(row.locator('input[value="absent"]')).toBeChecked();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await page.waitForURL(new RegExp(`/meetings/${meetingId}\\?saved=attendance`));
  await expect(page.getByText("Attendance saved.")).toBeVisible();
}

test("seeded grid shows Martin Meister present on 9/13 and highlights ?member=", async ({ page }) => {
  await signIn(page, CLEANER);
  await go(page, "/meetings/attendance");
  await expect(page.locator("h1")).toHaveText("Attendance");
  const row = page.locator("tr", { has: page.getByRole("link", { name: CLEANER.name }) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td[data-date="2026-09-13"]')).toHaveText("P");
  await expect(row.locator('td[data-date="2026-09-13"]')).toHaveAttribute("data-status", "present");
  await expect(page.getByText("Beta Alpha", { exact: false }).first()).toBeVisible();

  const memberId = (await row.getByRole("link", { name: CLEANER.name }).getAttribute("href"))!.match(/\/members\/(\d+)/)![1];
  await go(page, `/meetings/attendance?member=${memberId}`);
  await expect(page.locator(`tr#member-${memberId}`)).toHaveClass(/bg-primary-soft/);
});

test("admin creates a meeting, takes attendance and the meeting page shows counts", async ({ page }) => {
  await signIn(page, ADMIN);
  const title = uniq("Meeting");
  const id = await createMeeting(page, title, 1);
  await expect(page.getByText("Attendance not taken")).toBeVisible();

  await takeAttendance(page, id, BROTHER.name);
  await expect(page.getByTestId("count-absent")).toContainText("1");
  await expect(page.locator('[data-testid="attendance-row"]', { hasText: BROTHER.name })).toContainText("Absent");
  await expect(page.locator('[data-testid="attendance-row"]', { hasText: ADMIN.name })).toContainText("Present");

  // The list and the grid pick the new meeting up.
  await go(page, "/meetings?tab=past&kind=house");
  const listRow = page.locator('[data-testid="meeting-row"]', { hasText: title });
  await expect(listRow).toContainText("1 absent");
  await expect(listRow.getByRole("link", { name: "Edit attendance" })).toBeVisible();
});

test("brother requests an excuse, admin approves it and attendance defaults to excused", async ({ browser }) => {
  const admin = await newPage(browser);
  await signIn(admin.page, ADMIN);
  const title = uniq("Excusable");
  const id = await createMeeting(admin.page, title, 3);

  const brother = await newPage(browser);
  await signIn(brother.page, BROTHER);
  await go(brother.page, `/meetings/${id}`);
  await expect(brother.page.locator("h1")).toHaveText(title);
  await expect(brother.page.getByRole("link", { name: "Take attendance" })).toHaveCount(0);
  await brother.page.getByRole("button", { name: "Request excuse" }).click();
  const reason = uniq("Exam");
  await brother.page.fill(`#excuse-reason-${id}`, reason);
  await brother.page.getByRole("button", { name: "Send request" }).click();
  await expect(brother.page.getByText("Excuse requested.")).toBeVisible();
  await brother.page.getByRole("button", { name: "Done" }).click();
  await expect(brother.page.getByText("My excuse request")).toBeVisible();
  await expect(brother.page.getByText("Pending").first()).toBeVisible();
  await go(brother.page, "/meetings/excuses");
  await expect(brother.page.locator('[data-testid="my-excuse"]', { hasText: reason })).toContainText("Pending");
  await brother.ctx.close();

  await go(admin.page, "/meetings/excuses");
  const pending = admin.page.locator('[data-testid="pending-excuse"]', { hasText: reason });
  await expect(pending).toContainText(BROTHER.name);
  await pending.getByPlaceholder("Note (optional)").fill("Good luck");
  await pending.getByRole("button", { name: "Approve" }).click();
  await expect(pending).toHaveCount(0);

  await go(admin.page, `/meetings/${id}/attendance`);
  const row = admin.page.locator("li[data-member-id]", { hasText: BROTHER.name });
  await expect(row.locator('input[value="excused"]')).toBeChecked();
  await expect(row.getByText("Excuse approved")).toBeVisible();
  await expect(admin.page.locator("li[data-member-id]", { hasText: ADMIN.name }).locator('input[value="absent"]')).toBeChecked();
  await admin.ctx.close();
});

test("Fine absences previews the absent member and creates a charge", async ({ page }) => {
  await signIn(page, ADMIN);
  const title = uniq("Fineable");
  const id = await createMeeting(page, title, 2);
  await takeAttendance(page, id, BROTHER.name);

  const panel = page.getByTestId("fine-panel");
  await expect(panel.getByRole("link", { name: BROTHER.name })).toBeVisible();
  const memberId = (await panel.getByRole("link", { name: BROTHER.name }).getAttribute("href"))!.match(/\/members\/(\d+)/)![1];
  page.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Fine 1 absence" }).click();
  await expect(panel.getByText(/Created 1 fine of \$10\.00/)).toBeVisible();
  await expect(panel.getByText("Every absence for this meeting has been fined.")).toBeVisible();

  // Second pass is idempotent: nothing left to fine.
  await go(page, `/meetings/${id}`);
  await expect(page.getByTestId("fine-panel").getByRole("button", { name: /Fine/ })).toHaveCount(0);

  // The dues module (another team) lists the charge when it exists.
  const dues = await page.goto(`/dues/members/${memberId}`, { waitUntil: "load" }).catch(() => null);
  if (dues && dues.status() === 200 && !(await page.getByText("Coming soon").isVisible().catch(() => false))) {
    await expect(page.getByText(`Missed ${title}`, { exact: false }).first()).toBeVisible();
  }
});

test("admin creates a weekly series and re-running it skips existing dates", async ({ page }) => {
  await signIn(page, ADMIN);
  await go(page, "/meetings/new");
  const title = uniq("Committee");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await page.fill("#series-title", title);
  await page.selectOption("#series-kind", "committee");
  await page.selectOption("#series-weekday", "1");
  await page.fill("#series-time", "18:30");
  await page.fill("#series-first", day(1));
  await page.fill("#series-last", day(7));
  await page.getByRole("button", { name: "Create series" }).click();
  await expect(page.getByText(/Created \d+ meeting/)).toBeVisible();

  await page.getByRole("button", { name: "Create series" }).click();
  await expect(page.getByText(/Created 0 meetings, skipped \d+/)).toBeVisible();
});

test("plain brother cannot take attendance or create meetings", async ({ page }) => {
  await signIn(page, BROTHER);
  await go(page, "/meetings/1/attendance");
  await expect(page).toHaveURL(/\/dashboard\?denied=meetings\.manage/);
  await go(page, "/meetings/new");
  await expect(page).toHaveURL(/\/dashboard\?denied=meetings\.manage/);
  await go(page, "/meetings");
  await expect(page.locator("h1")).toHaveText("Meetings");
  await expect(page.getByRole("link", { name: "New meeting" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Take attendance" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request excuse" }).first()).toBeVisible();
});

test("mobile viewport renders the meetings list and the grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, BROTHER);
  await go(page, "/meetings");
  await expect(page.locator("h1")).toHaveText("Meetings");
  await expect(page.locator('[data-testid="meeting-row"]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await go(page, "/meetings/attendance");
  await expect(page.getByRole("link", { name: CLEANER.name })).toBeVisible();
  await expect(page.locator(".table-wrap").first()).toBeVisible();
});
