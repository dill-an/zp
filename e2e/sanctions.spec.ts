import { test, expect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, uniq } from "./helpers";

/**
 * Sanctions module. Tests run in order and share the records they create
 * (every reason is unique so reruns never collide with earlier data).
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // Against a dev server, hot-reload pushes would reload pages mid-test; a production server has no such socket.
  await page.routeWebSocket(/_next\/webpack-hmr/, () => {});
});

const reason1 = uniq("Sanction");
let sanction1 = "";
/** Waived with a $10 fine. */
let sanction2 = "";
/** Belongs to Martin: Gio must get a 404. */
let sanction3 = "";
/** Open, no fine: Gio appeals it. */
let sanction4 = "";

async function switchUser(page: Page, user: { username: string; password: string }) {
  await page.context().clearCookies();
  await login(page, user);
}

/**
 * Wait until React has hydrated the form. Before that a submit is a plain page POST, which never
 * triggers the client-side form reset the retry tests below cover.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("main form");
    return !!form && Object.keys(form).some((k) => k.startsWith("__reactFiber"));
  });
}

async function issue(page: Page, opts: { member: string; reason: string; fine?: string; job?: string; hours?: string; source?: string; due?: string }): Promise<string> {
  await page.goto("/sanctions/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Issue a sanction");
  await page.selectOption("#memberId", { label: opts.member });
  await page.fill("#reason", opts.reason);
  if (opts.job !== undefined) await page.fill("#jobDescription", opts.job);
  if (opts.hours !== undefined) await page.fill("#hours", opts.hours);
  await page.fill("#fineDollars", opts.fine ?? "");
  if (opts.source) await page.selectOption("#source", opts.source);
  if (opts.due !== undefined) await page.fill("#dueAt", opts.due);
  // Scope to main: the app shell's logout form comes first in the DOM.
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/sanctions\/\d+$/);
  return page.url().match(/\/sanctions\/(\d+)$/)![1];
}

test("admin issues a sanction with a $25 fine to Gio", async ({ page }) => {
  await login(page, ADMIN);
  sanction1 = await issue(page, {
    member: BROTHER.name,
    reason: reason1,
    job: "Deep clean the basement bathroom",
    hours: "2",
    fine: "25",
    source: "conduct",
    due: "2026-10-25T23:59",
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(reason1);
  const main = page.locator("main");
  await expect(main.getByText("Gio Mandwee").first()).toBeVisible();
  await expect(main.getByText("Deep clean the basement bathroom")).toBeVisible();
  await expect(main.getByText("2 hrs")).toBeVisible();
  await expect(main.getByText("$25.00").first()).toBeVisible();
  await expect(main.getByText("Conduct", { exact: true })).toBeVisible();
  await expect(main.getByText("Open", { exact: true }).first()).toBeVisible();
  await expect(main.getByText(/Oct 25/).first()).toBeVisible();
  // The fine landed on the ledger as a linked charge.
  await expect(main.getByText(`Fine: ${reason1}`)).toBeVisible();
  // It shows on the board under Open with the fine.
  await page.goto("/sanctions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Standards board");
  const row = page.locator(`tr[data-sanction-id="${sanction1}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText(reason1)).toBeVisible();
  await expect(row.getByText("$25.00")).toBeVisible();
});

test("Gio sees it under My sanctions with the fine and due date, starts and completes it", async ({ page }) => {
  await login(page, BROTHER);
  await page.goto("/sanctions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My sanctions");
  // Not a manager: no board, no issue button.
  await expect(page.getByRole("link", { name: "Issue sanction" })).toHaveCount(0);
  const card = page.locator(`li[data-sanction-id="${sanction1}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText(reason1)).toBeVisible();
  await expect(card.getByText("$25.00")).toBeVisible();
  await expect(card.getByText(/Oct 25/)).toBeVisible();
  await expect(card.getByText("Open", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Verify" })).toHaveCount(0);

  await card.getByRole("button", { name: "Start" }).click();
  await expect(card.getByText("In progress", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Start" })).toHaveCount(0);

  await card.getByRole("button", { name: "Mark completed" }).click();
  await expect(card.getByText("Done, to verify")).toBeVisible();
  await expect(card.getByText("Waiting for a standards officer to verify.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Mark completed" })).toHaveCount(0);

  // The detail page shows the timeline and the fine linking to dues.
  await page.goto(`/sanctions/${sanction1}`);
  await expect(page.locator("main").getByText("Started", { exact: false }).first()).toBeVisible();
  await expect(page.locator("main").getByText("Marked completed").first()).toBeVisible();
  // The fine links to his own ledger page (which admits the brother himself), not just /dues.
  const fineLink = page.locator("main").getByRole("link", { name: "$25.00" });
  await expect(fineLink).toHaveAttribute("href", /^\/dues\/members\/\d+$/);
  await expect(page.locator("main").getByRole("link", { name: "See my dues" })).toHaveAttribute("href", /^\/dues\/members\/\d+$/);
  await fineLink.click();
  await expect(page).toHaveURL(/\/dues\/members\/\d+$/);
});

test("admin sees it under To verify and verifies it", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/sanctions?tab=to_verify");
  const row = page.locator(`tr[data-sanction-id="${sanction1}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText(reason1)).toBeVisible();
  await expect(row.getByText("Done, to verify")).toBeVisible();
  await row.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(`[data-sanction-id="${sanction1}"]`)).toHaveCount(0);

  await page.goto(`/sanctions?tab=verified`);
  await expect(page.locator(`tr[data-sanction-id="${sanction1}"]`).getByText("Verified", { exact: true })).toBeVisible();

  await page.goto(`/sanctions/${sanction1}`);
  const main = page.locator("main");
  await expect(main.getByText("Verified", { exact: true }).first()).toBeVisible();
  await expect(main.getByText(`Verified by ${ADMIN.name}`)).toBeVisible();
  await expect(main.getByText(`Issued by ${ADMIN.name}`)).toBeVisible();
});

test("admin waives another sanction and the detail shows the waived state", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, ADMIN);
  const reason2 = uniq("Waive");
  sanction2 = await issue(page, { member: BROTHER.name, reason: reason2, fine: "10", job: "Mop the dining room" });
  const main = page.locator("main");
  await expect(main.getByText("$10.00").first()).toBeVisible();
  await main.getByRole("button", { name: "Waive" }).click();
  await expect(main.getByText("Waived", { exact: true }).first()).toBeVisible();
  await expect(main.getByText(`Waived by ${ADMIN.name}`)).toBeVisible();
  // The fine is offset by a credit on the ledger.
  await expect(main.getByText(`Waived fine: ${reason2}`)).toBeVisible();
  await expect(main.getByText("-$10.00")).toBeVisible();
  await expect(main.getByText("$0.00")).toBeVisible();
  await expect(main.getByRole("button", { name: "Waive" })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Reopen" })).toBeVisible();

  await page.goto("/sanctions?tab=waived");
  await expect(page.locator(`tr[data-sanction-id="${sanction2}"]`).getByText("Waived", { exact: true })).toBeVisible();

  // Records used by the next tests: one for Martin, one open one for Gio.
  sanction3 = await issue(page, { member: CLEANER.name, reason: uniq("Martin"), job: "Take out the recycling" });
  sanction4 = await issue(page, { member: BROTHER.name, reason: uniq("Appeal"), hours: "1" });
});

test("Gio cannot open another brother's sanction or the issue page, but can appeal his own", async ({ page }) => {
  await login(page, BROTHER);
  const res = await page.goto(`/sanctions/${sanction3}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();

  await page.goto("/sanctions/new");
  await expect(page).toHaveURL(/\/dashboard\?denied=sanctions\.manage/);

  await page.goto(`/sanctions/${sanction3}/edit`);
  await expect(page).toHaveURL(/\/dashboard\?denied=sanctions\.manage/);

  // Appeal his own open sanction through the dialog.
  await page.goto(`/sanctions/${sanction4}`);
  await page.getByRole("button", { name: "Appeal" }).click();
  await page.fill("#appeal-reason", "I was away at a conference that week.");
  await page.getByRole("button", { name: "Send appeal" }).click();
  const main = page.locator("main");
  await expect(main.getByText("Appealed", { exact: true }).first()).toBeVisible();
  await expect(main.getByText("I was away at a conference that week.").first()).toBeVisible();
  await expect(main.getByRole("button", { name: "Appeal" })).toHaveCount(0);
});

test("admin sees the appeal on the board and reopens it", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, ADMIN);
  await page.goto("/sanctions?tab=appealed");
  const row = page.locator(`tr[data-sanction-id="${sanction4}"]`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Reopen" }).click();
  await expect(page.locator(`[data-sanction-id="${sanction4}"]`)).toHaveCount(0);
  await page.goto("/sanctions?tab=open&q=Appeal");
  await expect(page.locator(`tr[data-sanction-id="${sanction4}"]`).getByText("Open", { exact: true })).toBeVisible();
});

test("policy edit saves and brothers can read it", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/sanctions/policy");
  const marker = uniq("Policy");
  await page.fill("#policy", `${marker} first paragraph.\n\nSecond paragraph of the policy.`);
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.locator("p[role=status]")).toHaveText("Policy saved.");
  await expect(page.locator("#policy-text p").first()).toContainText(`${marker} first paragraph.`);
  await expect(page.locator("#policy-text p")).toHaveCount(2);

  await switchUser(page, BROTHER);
  await page.goto("/sanctions/policy");
  await expect(page.locator("#policy-text")).toContainText("Second paragraph of the policy.");
  await expect(page.locator("#policy")).toHaveCount(0);
});

test("mobile viewport renders the list for a brother and the board for a manager", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, BROTHER);
  await page.goto("/sanctions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My sanctions");
  await expect(page.locator(`li[data-sanction-id="${sanction1}"]`)).toBeVisible();
  await expect(page.locator(`li[data-sanction-id="${sanction1}"]`).getByText("$25.00")).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflows).toBe(false);

  await switchUser(page, ADMIN);
  await page.goto("/sanctions?tab=all");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Standards board");
  // Phones get stacked cards, not the table.
  await expect(page.locator(`ul li[data-sanction-id="${sanction1}"]`)).toBeVisible();
  await expect(page.locator(`tr[data-sanction-id="${sanction1}"]`)).toBeHidden();
  const boardOverflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(boardOverflows).toBe(false);
});

test("a failed submit keeps the chosen brother and source, so the corrected resubmit stores them", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/sanctions/new");
  await waitForHydration(page);
  const reason = uniq("Retry");
  await page.selectOption("#memberId", { label: BROTHER.name });
  await page.selectOption("#source", "conduct");
  await page.fill("#reason", reason);
  await page.fill("#fineDollars", "abc");
  await page.click("main form button[type=submit]");
  const alert = page.locator("main p[role=alert]");
  await expect(alert).toHaveText("Fine dollars: Enter a dollar amount like 25 or 12.50.");
  // React resets the form after the action returns; the selects must still show what was picked.
  await expect(page.locator("#memberId option:checked")).toHaveText(BROTHER.name);
  await expect(page.locator("#source")).toHaveValue("conduct");
  await expect(page.locator("#reason")).toHaveValue(reason);
  await expect(page.locator("#fineDollars")).toHaveValue("abc");

  await page.fill("#fineDollars", "5");
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/sanctions\/\d+$/);
  const main = page.locator("main");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(reason);
  await expect(main.getByText(BROTHER.name).first()).toBeVisible();
  await expect(main.getByText("Conduct", { exact: true })).toBeVisible();
  await expect(main.getByText("$5.00").first()).toBeVisible();

  // Same on the edit page: a changed source survives a failed save.
  await main.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\/sanctions\/\d+\/edit$/);
  await waitForHydration(page);
  await page.selectOption("#source", "late_dues");
  await page.fill("#fineDollars", "zzz");
  await page.click("main form button[type=submit]");
  await expect(alert).toHaveText("Fine dollars: Enter a dollar amount like 25 or 12.50.");
  await expect(page.locator("#source")).toHaveValue("late_dues");
  await page.fill("#fineDollars", "7.50");
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/sanctions\/\d+$/);
  await expect(main.getByText("Late dues", { exact: true })).toBeVisible();
  await expect(main.getByText("$7.50").first()).toBeVisible();
});

test("a failed multi-brother submit keeps the toggle and the checked brothers", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/sanctions/new");
  await waitForHydration(page);
  const reason = uniq("Multi");
  const toggle = page.getByLabel("Apply to several brothers");
  await toggle.check();
  await page.getByLabel(BROTHER.name, { exact: true }).check();
  await page.getByLabel(CLEANER.name, { exact: true }).check();
  await page.fill("#reason", reason);
  await page.fill("#fineDollars", "zzz");
  await page.click("main form button[type=submit]");
  await expect(page.locator("main p[role=alert]")).toHaveText("Fine dollars: Enter a dollar amount like 25 or 12.50.");
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel(BROTHER.name, { exact: true })).toBeChecked();
  await expect(page.getByLabel(CLEANER.name, { exact: true })).toBeChecked();
  await expect(page.locator("main input[name='memberIds[]']:checked")).toHaveCount(2);
  await expect(page.locator("main form button[type=submit]")).toHaveText("Issue to selected");

  await page.fill("#fineDollars", "5");
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/sanctions\?issued=2$/);
  await expect(page.locator("p[role=status]")).toHaveText("Issued 2 sanctions.");
  await page.goto(`/sanctions?tab=open&q=${encodeURIComponent(reason)}`);
  const rows = page.locator("tr[data-sanction-id]");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: BROTHER.name })).toHaveCount(1);
  await expect(rows.filter({ hasText: CLEANER.name })).toHaveCount(1);
  await expect(rows.filter({ hasText: "$5.00" })).toHaveCount(2);
});

test("Jobs tab groups punishment jobs and does not link the no-job group to an empty search", async ({ page }) => {
  await login(page, ADMIN);
  // Its own records: one with a job description, one with hours only (no job text at all).
  const job = uniq("Scrub the walk-in fridge");
  const jobId = await issue(page, { member: BROTHER.name, reason: uniq("Jobs"), job });
  const noJobId = await issue(page, { member: BROTHER.name, reason: uniq("HoursOnly"), hours: "1" });

  await page.goto("/sanctions?tab=jobs");
  const main = page.locator("main");
  // A real job links to the board filtered by its text, and that search finds the sanction.
  const jobLink = main.getByRole("link", { name: job });
  await expect(jobLink).toHaveAttribute("href", /\/sanctions\?tab=all&q=Scrub/);
  // The synthetic no-job group is plain text (a q= search for its label would match nothing),
  // but the brother who still owes it links to the sanction itself.
  await expect(main.getByText("No job (fine or hours only)")).toBeVisible();
  await expect(main.getByRole("link", { name: "No job (fine or hours only)" })).toHaveCount(0);
  await expect(main.locator(`a[href="/sanctions/${noJobId}"]`)).toBeVisible();

  await jobLink.click();
  await page.waitForURL(/\/sanctions\?tab=all&q=/);
  await expect(page.locator(`tr[data-sanction-id="${jobId}"]`)).toBeVisible();
  await expect(page.locator("tr[data-sanction-id]")).toHaveCount(1);
});
