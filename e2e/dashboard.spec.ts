import { test, expect as baseExpect, request as playwrightRequest, type Page } from "@playwright/test";
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

/**
 * A dev server restarts itself when it nears its heap limit and a navigation caught in that window
 * never answers; retrying a couple of times keeps that from sinking a whole serial suite.
 */
async function goto(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { timeout: 45_000 });
      return;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(3_000);
    }
  }
  throw lastError;
}

const HOUSE_TZ = "America/New_York";

/** Today's calendar date in the house timezone. */
function houseToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOUSE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "YYYY-MM-DD" `days` after a calendar date. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** The Sunday that starts next labor week (house time). */
function nextWeekSunday(): string {
  const today = houseToday();
  const [y, m, d] = today.split("-").map(Number);
  return shiftDate(today, 7 - new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** Unfolds an iCalendar body so assertions can match whole property lines. */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

/** The brother's calendar feed URL as shown on /settings. */
async function feedUrl(page: Page): Promise<string> {
  await goto(page, "/settings");
  await expect(page.getByTestId("calendar-card")).toBeVisible();
  const url = await page.locator("#calendar-https").inputValue();
  expect(url).toMatch(/^https?:\/\/.+\/api\/calendar\/[0-9a-f]{32}$/);
  return url;
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
  await goto(page, "/labor");
  const copy = page.getByRole("button", { name: "Copy last week" });
  if (await copy.isVisible()) {
    await copy.click();
    await expect(copy).toBeHidden();
  }
  await goto(page, "/labor?manage=1");
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
    // An open job shows the relative due text after a space, never glued to the date.
    await expect(job.getByTestId("job-due")).toHaveText(/due \w{3}, \w{3} \d{1,2} \((due today|due tomorrow|due in \d+ days|\d+ days? overdue)\)/);
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

  // Seeded brothers have no phone or email on file, so the dashboard asks for them.
  const notice = page.getByTestId("contact-notice");
  if (await notice.count()) {
    await expect(notice).toContainText("Add your phone and email so officers can reach you.");
    await expect(notice.getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", /^\/members\/\d+\/edit$/);
  } else {
    // Another run filled them in: the notice only goes away once both are set.
    await goto(page, "/settings");
    await page.getByTestId("profile-card").getByRole("link", { name: "Edit profile" }).click();
    await expect(page.locator("#phone")).not.toHaveValue("");
    await expect(page.locator("#email")).not.toHaveValue("");
  }

  // My week: the same job, header counts.
  await goto(page, "/my-week");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My week");
  await expect(page.getByTestId("week-summary")).toContainText(/\d+ things? this week, \d+ done/);
  const weekJob = page.getByTestId("week-jobs").locator(`li[data-job="${JOB}"]`);
  await expect(weekJob).toBeVisible();
  await expect(weekJob.getByText(/^(Done|Verified)$/)).toBeVisible();
  await expect(page.getByTestId("week-meetings")).toBeVisible();
  await expect(page.getByTestId("week-next")).toBeVisible();
});

test("Waiting on you lists a task just assigned to the brother and an event duty this week, linking to where the action happens", async ({ page }) => {
  const taskTitle = uniq("Waiting task");
  const eventTitle = uniq("Waiting event");
  const today = houseToday();

  await login(page, ADMIN);
  // A task assigned to Gio right now.
  await goto(page, "/tasks/new");
  await page.fill("#title", taskTitle);
  await page.getByLabel(BROTHER.name).check();
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/\d+$/);
  const taskHref = new URL(page.url()).pathname;

  // An event later today (so it sits inside the current labor week) with a duty for Gio.
  await goto(page, "/events/new");
  await page.fill("#title", eventTitle);
  await page.fill("#startsAt", `${today}T23:30`);
  await page.fill("#endsAt", `${shiftDate(today, 1)}T03:00`);
  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/events\/\d+$/);
  const eventHref = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Add duty" }).click();
  await page.selectOption("#dutyMemberId", { label: BROTHER.name });
  await page.selectOption("#duty", "sober_monitor");
  await page.fill("#label", "Late shift");
  await page.getByRole("button", { name: "Save duty" }).click();
  await expect(page.getByText("Duty added.")).toBeVisible();

  await page.context().clearCookies();
  await login(page, BROTHER);
  const card = page.getByTestId("waiting-card");
  await expect(card).toBeVisible();
  const taskRow = card.locator("li[data-waiting-kind=task]").filter({ hasText: taskTitle });
  await expect(taskRow).toBeVisible();
  await expect(taskRow).toContainText("New task");
  await expect(taskRow.getByRole("link")).toHaveAttribute("href", taskHref);
  const dutyRow = card.locator("li[data-waiting-kind=duty]").filter({ hasText: eventTitle });
  await expect(dutyRow).toContainText(`Late shift at ${eventTitle}`);
  await expect(dutyRow.getByRole("link")).toHaveAttribute("href", eventHref);

  // The same card opens My week.
  await goto(page, "/my-week");
  await expect(page.getByTestId("waiting-card").locator("li[data-waiting-kind=task]").filter({ hasText: taskTitle })).toBeVisible();
  await expect(page.getByTestId("waiting-card").locator("li[data-waiting-kind=duty]").filter({ hasText: eventTitle })).toBeVisible();

  // Tidy up the event so the duty does not linger for other runs.
  await page.context().clearCookies();
  await login(page, ADMIN);
  await goto(page, eventHref);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/events$/);
});

test("a published next week with no job for the brother reads 'No jobs for you next week'", async ({ page }) => {
  const next = nextWeekSunday();
  await login(page, ADMIN);
  await goto(page, `/labor/week/${next}`);
  const create = page.getByRole("button", { name: "Create empty week" });
  if (await create.isVisible()) {
    await create.click();
    await page.waitForURL(new RegExp(`/labor/week/${next}\\?manage=1`));
  }
  await goto(page, `/labor/week/${next}?manage=1`);
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  if (await publish.count()) {
    await publish.click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
  }

  await page.context().clearCookies();
  await login(page, BROTHER);
  const card = page.getByTestId("my-week-card");
  await expect(card).toBeVisible();
  const empty = card.getByTestId("my-week-next-empty");
  const noJobs = (await empty.count()) > 0;
  if (noJobs) {
    await expect(empty).toHaveText("No jobs for you next week.");
  } else {
    // Someone gave Gio a job next week; the list shows instead of the empty line.
    await expect(card.getByTestId("my-week-next")).toBeVisible();
  }
  await expect(card).not.toContainText("Nothing posted for next week yet");

  await goto(page, "/my-week");
  const nextCard = page.getByTestId("week-next");
  await expect(nextCard).toBeVisible();
  await expect(nextCard).not.toContainText("Nothing posted for next week yet");
  if (noJobs) await expect(nextCard).toContainText("No jobs for you next week.");
});

test("an officer sees unassigned tasks from a board they run on My tasks, marked as board tasks", async ({ page }) => {
  const title = uniq("Board task");
  await login(page, ADMIN);
  await goto(page, "/chairs/historian");
  const holders = page.getByTestId("current-holders");
  const alreadyHolds = (await holders.count()) && (await holders.getByRole("link", { name: ADMIN.name }).count()) > 0;
  if (!alreadyHolds) {
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("#memberId", { label: ADMIN.name });
    await page.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(page.getByTestId("current-holders").getByRole("link", { name: ADMIN.name })).toBeVisible();
  }

  await page.getByTestId("new-task-link").click();
  await page.waitForURL(/\/tasks\/new\?chair=\d+$/);
  await page.fill("#title", title);
  await page.getByRole("button", { name: "Create task" }).click();
  await page.waitForURL(/\/tasks\/\d+$/);
  const taskHref = new URL(page.url()).pathname;

  await goto(page, "/dashboard");
  const board = page.getByTestId("my-tasks-card").getByTestId("board-tasks");
  await expect(board).toBeVisible();
  await expect(board).toContainText("On my boards, nobody assigned");
  const row = board.locator("li[data-board='1']").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText("Board", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: title })).toHaveAttribute("href", taskHref);
  // It is not one of my own tasks.
  await expect(page.getByTestId("my-tasks-card").getByTestId("my-tasks-list").filter({ hasText: title })).toHaveCount(0);

  // Hand the chair back so Dylan stays a plain admin for the other suites.
  await goto(page, "/chairs/historian");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("current-holders").getByRole("button", { name: "End term" }).first().click();
  await expect(page.getByTestId("current-holders")).toHaveCount(0);
  await goto(page, "/dashboard");
  await expect(page.getByTestId("my-tasks-card").getByTestId("board-tasks")).toHaveCount(0);
});

test("the web app manifest and icons are served without a session", async ({ page, baseURL }) => {
  const anon = await playwrightRequest.newContext({ baseURL });
  const manifest = await anon.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const json = await manifest.json();
  expect(json.name).toBe("ZP House");
  expect(json.short_name).toBe("ZP House");
  expect(json.display).toBe("standalone");
  expect(json.theme_color).toBe("#0a0a0a");
  expect(json.background_color).toBe("#0a0a0a");
  expect(json.icons.map((i: { src: string }) => i.src)).toEqual(["/icon-192.png", "/icon-512.png"]);
  for (const icon of ["/icon-192.png", "/icon-512.png"]) {
    const res = await anon.get(icon);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    expect((await res.body()).subarray(1, 4).toString("ascii")).toBe("PNG");
  }
  await anon.dispose();

  await login(page, ADMIN);
  await expect(page.locator("link[rel=manifest]")).toHaveAttribute("href", "/manifest.webmanifest");
});

test("the calendar feed on /settings serves the brother's jobs as iCal without a session and rejects a bad token", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, CLEANER);
  const url = await feedUrl(page);
  const webcal = await page.locator("#calendar-webcal").inputValue();
  expect(webcal).toBe(url.replace(/^https?:\/\//, "webcal://"));
  await expect(page.getByTestId("calendar-card")).toContainText("iPhone:");
  await expect(page.getByTestId("calendar-card")).toContainText("Google Calendar:");
  await page.getByTestId("copy-calendar-webcal").click();
  await expect(page.getByTestId("copy-calendar-webcal")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(webcal);

  // No cookies at all: calendar apps fetch the feed on their own.
  const anon = await playwrightRequest.newContext();
  const res = await anon.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const ics = unfold(await res.text());
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("END:VCALENDAR");
  // Martin's job from the first test, all-day on its due date.
  const job = ics.split("BEGIN:VEVENT").find((chunk) => chunk.includes(`SUMMARY:Clean: ${JOB}`));
  expect(job).toBeTruthy();
  expect(job).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
  expect(job).toMatch(/URL:https?:\/\/.+\/labor\/week\/\d{4}-\d{2}-\d{2}/);
  // Seeded Sunday house meetings are in the feed too.
  expect(ics).toContain("SUMMARY:House Meeting");

  const bad = await anon.get(url.replace(/[0-9a-f]{32}$/, "0123456789abcdef0123456789abcdef"));
  expect(bad.status()).toBe(404);
  const malformed = await anon.get(url.replace(/[0-9a-f]{32}$/, "nope"));
  expect(malformed.status()).toBe(404);
  await anon.dispose();

  // Each brother gets a different link.
  await page.context().clearCookies();
  await login(page, BROTHER);
  expect(await feedUrl(page)).not.toBe(url);
});

test("admin saves the Venmo handle under house settings and /dues shows it", async ({ page }) => {
  await login(page, ADMIN);
  await goto(page, "/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.getByTestId("profile-card").getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/settings/password");
  await expect(page.getByTestId("profile-card").getByRole("link", { name: "Edit profile" })).toHaveAttribute("href", /\/members\/\d+\/edit$/);
  await page.fill("#venmoHandle", `@${VENMO}`);
  await page.getByRole("button", { name: "Save house settings" }).click();
  await expect(page.locator("p[role=status]")).toHaveText("Settings saved.");
  await expect(page.locator("#venmoHandle")).toHaveValue(VENMO);

  await goto(page, "/dues");
  await expect(page.getByText(`@${VENMO}`)).toBeVisible();
});

test("audit log lists entries newest first and filters by text", async ({ page }) => {
  await login(page, ADMIN);
  await goto(page, "/settings/audit");
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
  await goto(page, "/settings");
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
  await goto(page, "/settings/audit");
  await expect(page).toHaveURL(/\/dashboard\?denied=audit\.view/);
  await expect(page.getByTestId("denied-notice")).toHaveText("You do not have access to audit.view.");
  await noHorizontalOverflow(page);

  await goto(page, "/settings");
  await expect(page.getByTestId("profile-card")).toBeVisible();
  await expect(page.locator("#venmoHandle")).toHaveCount(0);
  await expect(page.getByTestId("data-card")).toHaveCount(0);

  await goto(page, "/my-week");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My week");
  await noHorizontalOverflow(page);
});
