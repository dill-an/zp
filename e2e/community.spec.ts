import { test, expect, request as playwrightRequest, type Browser, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, uniq } from "./helpers";

type Account = { username: string; password: string };
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Each account logs in once per run; later contexts reuse its session cookie. */
const sessions = new Map<string, StorageState>();

/**
 * Against a dev server, Fast Refresh refetches the open page after every file change in the
 * tree; that is noise for a test (and absent under `next start`), so the HMR socket is mocked.
 */
async function quietContext(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.routeWebSocket(/webpack-hmr|turbopack-hmr/, () => {});
  return context;
}

async function sessionFor(browser: Browser, user: Account): Promise<StorageState> {
  let state = sessions.get(user.username);
  if (!state) {
    const context = await quietContext(browser);
    const page = await context.newPage();
    await login(page, user);
    state = await context.storageState();
    sessions.set(user.username, state);
    await context.close();
  }
  return state;
}

/** A browser context logged in as `user`, so two brothers can act in one test. */
async function userPage(browser: Browser, user: Account, options: BrowserContextOptions = {}) {
  const context = await quietContext(browser, { ...options, storageState: await sessionFor(browser, user) });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

/** "YYYY-MM-DDTHH:mm" for `days` from now at 19:00 (datetime-local value). */
function futureLocal(days: number, time = "19:00") {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${time}`;
}

/** The form's own error message (Next's route announcer also has role="alert"). */
function formError(page: Page) {
  return page.locator("p[role=alert]");
}

async function createEvent(page: Page, title: string, opts: { startsAt?: string; kind?: string; mandatory?: boolean } = {}) {
  await page.goto("/events/new");
  await page.fill("#title", title);
  await page.selectOption("#kind", opts.kind ?? "social");
  await page.fill("#startsAt", opts.startsAt ?? futureLocal(10));
  await page.fill("#location", "House basement");
  if (opts.mandatory) await page.check("#isMandatory");
  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/events\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url();
}

test("admin creates an event, brother RSVPs, gets a sober monitor duty and marks it done", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const title = uniq("Mixer");
  const eventUrl = await createEvent(admin.page, title);
  await expect(admin.page.getByTestId("rsvp-summary")).toHaveText(/0 going, 0 maybe/);

  // Brother RSVPs going with a guest; the count updates and they appear in the Going list.
  await brother.page.goto(eventUrl);
  await brother.page.fill("#guests", "1");
  await brother.page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(brother.page.getByTestId("rsvp-summary")).toHaveText(/1 going \(\+1 guests\), 0 maybe/);
  await expect(brother.page.getByText("You: going")).toBeVisible();
  await expect(brother.page.getByRole("link", { name: BROTHER.name })).toBeVisible();

  // Changing to maybe moves them over.
  await brother.page.getByRole("button", { name: "Maybe", exact: true }).click();
  await expect(brother.page.getByTestId("rsvp-summary")).toHaveText(/0 going, 1 maybe/);
  await expect(brother.page.getByRole("button", { name: "Going", exact: true })).toBeVisible();

  // Admin assigns a sober monitor duty to the brother.
  await admin.page.goto(eventUrl);
  await admin.page.getByRole("button", { name: "Add duty" }).click();
  await admin.page.selectOption("#dutyMemberId", { label: BROTHER.name });
  await admin.page.selectOption("#duty", "sober_monitor");
  await admin.page.fill("#label", "First shift");
  await admin.page.getByRole("button", { name: "Save duty" }).click();
  await expect(admin.page.getByText("Duty added.")).toBeVisible();
  const dutyRow = admin.page.locator("tr[data-duty-id]").filter({ hasText: BROTHER.name });
  await expect(dutyRow).toContainText("Sober monitor");
  await expect(dutyRow).toContainText("First shift");
  await expect(dutyRow).toContainText("Assigned");

  // The brother sees the duty and marks it done; nobody else's buttons show.
  await brother.page.goto(eventUrl);
  const myRow = brother.page.locator("tr[data-duty-id]").filter({ hasText: BROTHER.name });
  await expect(myRow).toContainText("Assigned");
  await expect(myRow.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await myRow.getByRole("button", { name: "Mark done" }).click();
  await expect(myRow).toContainText("Done");
  await expect(myRow.getByRole("button", { name: "Mark done" })).toHaveCount(0);

  // Admin deletes the event; it disappears from the list.
  await admin.page.goto(eventUrl);
  admin.page.once("dialog", (d) => d.accept());
  await admin.page.getByRole("button", { name: "Delete" }).click();
  await admin.page.waitForURL(/\/events$/);
  await expect(admin.page.getByRole("link", { name: title })).toHaveCount(0);

  await admin.close();
  await brother.close();
});

test("events list filters by kind and hides manage controls from a plain brother", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const title = uniq("Rush BBQ");
  await createEvent(admin.page, title, { kind: "rush", mandatory: true });
  await expect(admin.page.getByRole("note")).toContainText("Attendance is mandatory");

  await brother.page.goto("/events");
  const card = brother.page.locator("h3").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(brother.page.getByRole("link", { name: "New event" })).toHaveCount(0);
  await expect(brother.page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await brother.page.goto("/events?kind=rush");
  await expect(brother.page.locator("h3").filter({ hasText: title })).toBeVisible();
  await expect(brother.page.getByText("Mandatory").first()).toBeVisible();
  await brother.page.goto("/events?kind=athletics");
  await expect(brother.page.locator("h3").filter({ hasText: title })).toHaveCount(0);
  await brother.page.goto("/events?tab=past");
  await expect(brother.page.locator("h3").filter({ hasText: title })).toHaveCount(0);

  // The brother is bounced off the manage pages.
  await brother.page.goto("/events/new");
  await expect(brother.page).toHaveURL(/\/dashboard\?denied=events\.manage/);

  await admin.close();
  await brother.close();
});

test("admin posts a pinned announcement and an officers-only one; the brother sees only the first", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const publicTitle = uniq("House news");
  const officerTitle = uniq("Exec only");

  await admin.page.goto("/announcements/new");
  await admin.page.fill("#title", publicTitle);
  await admin.page.fill("#body", "First paragraph.\n\nSecond paragraph with a\nline break.");
  await admin.page.selectOption("#audience", "all");
  await admin.page.check("#isPinned");
  await admin.page.getByRole("button", { name: "Post", exact: true }).click();
  await admin.page.waitForURL(/\/announcements$/);
  const publicCard = admin.page.locator("[data-announcement-id]").filter({ hasText: publicTitle });
  await expect(publicCard).toBeVisible();
  await expect(publicCard.getByText("Pinned", { exact: true })).toBeVisible();
  await expect(publicCard.locator("p").filter({ hasText: "Second paragraph" })).toContainText("line break");

  await admin.page.goto("/announcements/new");
  await admin.page.fill("#title", officerTitle);
  await admin.page.fill("#body", "Budget review on Sunday.");
  await admin.page.selectOption("#audience", "officers");
  await admin.page.getByRole("button", { name: "Post", exact: true }).click();
  await admin.page.waitForURL(/\/announcements$/);
  await expect(admin.page.locator("[data-announcement-id]").filter({ hasText: officerTitle })).toBeVisible();

  // Brother: sees the public one first (pinned), never the officers-only one, even with ?all=1.
  await brother.page.goto("/announcements");
  await expect(brother.page.locator("[data-announcement-id]").filter({ hasText: publicTitle })).toBeVisible();
  await expect(brother.page.locator("[data-announcement-id]").filter({ hasText: officerTitle })).toHaveCount(0);
  await expect(brother.page.getByRole("link", { name: "New announcement" })).toHaveCount(0);
  await expect(brother.page.getByRole("button", { name: "Unpin" })).toHaveCount(0);
  await brother.page.goto("/announcements?all=1");
  await expect(brother.page.locator("[data-announcement-id]").filter({ hasText: officerTitle })).toHaveCount(0);
  await brother.page.goto("/announcements/new");
  await expect(brother.page).toHaveURL(/\/dashboard\?denied=announcements\.post/);

  // Admin unpins (a double tap must not undo itself) and deletes the public one.
  await admin.page.goto("/announcements");
  await publicCard.getByRole("button", { name: "Unpin" }).dblclick();
  await expect(publicCard.getByRole("button", { name: "Pin", exact: true })).toBeVisible();
  await expect(publicCard.getByText("Pinned", { exact: true })).toHaveCount(0);
  admin.page.once("dialog", (d) => d.accept());
  await publicCard.getByRole("button", { name: "Delete" }).click();
  await expect(admin.page.locator("[data-announcement-id]").filter({ hasText: publicTitle })).toHaveCount(0);

  await admin.close();
  await brother.close();
});

test("brother reports a maintenance issue; admin assigns it and resolves it", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const title = uniq("Leaky faucet");

  await brother.page.goto("/maintenance");
  await brother.page.getByRole("button", { name: "Report an issue" }).click();
  await brother.page.fill("#report-title", title);
  await brother.page.fill("#report-location", "2nd floor bathroom");
  await brother.page.selectOption("#report-priority", "high");
  await brother.page.fill("#report-description", "Drips all night.");
  await brother.page.getByRole("button", { name: "Report", exact: true }).click();
  await brother.page.waitForURL(/\/maintenance\/\d+$/);
  const requestUrl = brother.page.url();
  await expect(brother.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(brother.page.getByTestId("request-status")).toContainText("Open");
  await expect(brother.page.getByTestId("request-status")).toContainText("High priority");
  await expect(brother.page.getByText("Edit request")).toBeVisible();
  await expect(brother.page.getByText("Manage", { exact: true })).toHaveCount(0);

  // It shows on the Open tab for everyone, with the reporter.
  await brother.page.goto("/maintenance");
  const openCard = brother.page.locator("[data-request-id]").filter({ hasText: title });
  await expect(openCard).toBeVisible();
  await expect(openCard).toContainText(BROTHER.name);
  await expect(openCard).toContainText(/Reported (just now|\d+ minutes? ago)/);

  // Admin assigns it to the brother.
  await admin.page.goto(requestUrl);
  await admin.page.selectOption("select[name=assignedToId]", { label: BROTHER.name });
  await admin.page.getByRole("button", { name: "Assign" }).click();
  await expect(admin.page.getByText("Assigned.", { exact: true })).toBeVisible();
  await expect(admin.page.getByTestId("assignee")).toContainText(BROTHER.name);

  // The assignee can move it along.
  await brother.page.goto(requestUrl);
  await brother.page.getByRole("button", { name: "Mark in progress" }).click();
  await expect(brother.page.getByTestId("request-status")).toContainText("In progress");
  await expect(brother.page.getByText("Edit request")).toHaveCount(0);

  // Admin resolves it with notes.
  await admin.page.goto(requestUrl);
  await admin.page.selectOption("select[name=status]", "resolved");
  await admin.page.fill("textarea[name=resolutionNotes]", "Replaced the washer.");
  await admin.page.getByRole("button", { name: "Update status" }).click();
  await expect(admin.page.getByText("Marked resolved.")).toBeVisible();
  await expect(admin.page.getByTestId("request-status")).toContainText("Resolved");
  await expect(admin.page.getByTestId("resolution-notes")).toContainText("Replaced the washer.");

  await admin.page.goto("/maintenance?tab=resolved");
  const resolvedCard = admin.page.locator("[data-request-id]").filter({ hasText: title });
  await expect(resolvedCard).toBeVisible();
  await expect(resolvedCard).toContainText("Resolved");
  await admin.page.goto("/maintenance");
  await expect(admin.page.locator("[data-request-id]").filter({ hasText: title })).toHaveCount(0);

  await admin.close();
  await brother.close();
});

test("calendar month renders the event and seeded house meetings", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const title = uniq("Alumni dinner");
  const startsAt = futureLocal(45, "18:30");
  await createEvent(admin.page, title, { startsAt, kind: "alumni" });
  const month = startsAt.slice(0, 7);
  const date = startsAt.slice(0, 10);

  await admin.page.goto(`/events/calendar?month=${month}`);
  const cell = admin.page.locator(`[data-date="${date}"]`);
  await expect(cell).toBeVisible();
  const chip = cell.getByRole("link", { name: new RegExp(title) });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("6:30 PM");
  await chip.click();
  await admin.page.waitForURL(/\/events\/\d+$/);
  await expect(admin.page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // Seeded Sunday house meetings show up as chips in October 2026, and month navigation works.
  await admin.page.goto("/events/calendar?month=2026-10");
  await expect(admin.page.getByRole("heading", { level: 1, name: "October 2026" })).toBeVisible();
  await expect(admin.page.locator('[data-date="2026-10-25"]').getByRole("link", { name: /House Meeting/ })).toBeVisible();
  await admin.page.getByRole("link", { name: "Next month" }).click();
  await expect(admin.page.getByRole("heading", { level: 1, name: "November 2026" })).toBeVisible();
  await expect(admin.page.locator('[data-date="2026-11-01"]').getByRole("link", { name: /House Meeting/ })).toBeVisible();

  await admin.close();
});

test("mobile viewport renders events, an event with duties and the calendar day list", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const title = uniq("Mobile social");
  const startsAt = futureLocal(20, "21:00");
  const eventUrl = await createEvent(admin.page, title, { startsAt });
  await admin.page.getByRole("button", { name: "Add duty" }).click();
  await admin.page.selectOption("#dutyMemberId", { label: CLEANER.name });
  await admin.page.selectOption("#duty", "cleanup");
  await admin.page.fill("#label", "Kitchen after midnight");
  await admin.page.getByRole("button", { name: "Save duty" }).click();
  await expect(admin.page.getByText("Duty added.")).toBeVisible();
  // The manager's view has the action buttons in the table; it must fit a phone too.
  await admin.page.setViewportSize({ width: 390, height: 844 });
  await admin.page.goto(eventUrl);
  await expect(admin.page.locator("tr[data-duty-id]").getByRole("button", { name: "Remove" })).toBeVisible();
  const adminOverflow = await admin.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(adminOverflow).toBeLessThanOrEqual(1);
  await admin.close();

  const mobile = await userPage(browser, BROTHER, { viewport: { width: 390, height: 844 } });
  const { page } = mobile;
  await page.goto("/events");
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // The event page with a duties table must scroll the table inside its card, not widen the page.
  await page.goto(eventUrl);
  await expect(page.locator("tr[data-duty-id]").filter({ hasText: CLEANER.name })).toBeVisible();
  const eventOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(eventOverflow).toBeLessThanOrEqual(1);

  await page.goto(`/events/calendar?month=${startsAt.slice(0, 7)}`);
  const dayList = page.locator("section[aria-label='Day by day']");
  await expect(dayList).toBeVisible();
  await expect(dayList.getByRole("link", { name: title })).toBeVisible();
  await expect(page.locator(`[data-date="${startsAt.slice(0, 10)}"]`)).toBeVisible();
  await mobile.close();
});

test("forms keep select choices after a failed submit", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const { page } = admin;

  // Event form: the end-before-start rule fails on the server; kind and chair must survive the form reset.
  await page.goto("/events/new");
  await page.fill("#title", uniq("Retry"));
  await page.selectOption("#kind", "rush");
  const chairValue = (await page.locator("#chairId option").nth(1).getAttribute("value")) ?? "";
  expect(chairValue).not.toBe("");
  await page.selectOption("#chairId", chairValue);
  await page.fill("#startsAt", futureLocal(5, "20:00"));
  await page.fill("#endsAt", futureLocal(5, "19:00"));
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(formError(page)).toContainText("The end must be after the start.");
  await expect(page.locator("#kind")).toHaveValue("rush");
  await expect(page.locator("#chairId")).toHaveValue(chairValue);

  // Duty dialog: same rule; the brother and the duty kind must survive.
  const eventUrl = await createEvent(page, uniq("Duty retry"));
  await page.getByRole("button", { name: "Add duty" }).click();
  await page.selectOption("#dutyMemberId", { label: CLEANER.name });
  const memberValue = await page.locator("#dutyMemberId").inputValue();
  expect(memberValue).not.toBe("");
  await page.selectOption("#duty", "door");
  await page.fill("#dutyStartsAt", futureLocal(10, "23:00"));
  await page.fill("#dutyEndsAt", futureLocal(10, "22:00"));
  await page.getByRole("button", { name: "Save duty" }).click();
  await expect(formError(page)).toContainText("The end must be after the start.");
  await expect(page.locator("#dutyMemberId")).toHaveValue(memberValue);
  await expect(page.locator("#duty")).toHaveValue("door");

  // Announcement: a blank body passes the browser's required check but fails on the server; audience must survive.
  await page.goto("/announcements/new");
  await page.fill("#title", uniq("Blank body"));
  await page.fill("#body", " ");
  await page.selectOption("#audience", "officers");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(formError(page)).toContainText("Write the announcement.");
  await expect(page.locator("#audience")).toHaveValue("officers");

  // Maintenance report: a blank title fails on the server; priority must survive.
  await page.goto("/maintenance");
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.fill("#report-title", " ");
  await page.selectOption("#report-priority", "urgent");
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(formError(page)).toContainText("Say what is broken in a few words.");
  await expect(page.locator("#report-priority")).toHaveValue("urgent");

  await page.goto(eventUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/events$/);
  await admin.close();
});

test("a brother cannot overturn a missed verdict on his own duty", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const eventUrl = await createEvent(admin.page, uniq("Formal"));
  await admin.page.getByRole("button", { name: "Add duty" }).click();
  await admin.page.selectOption("#dutyMemberId", { label: BROTHER.name });
  await admin.page.selectOption("#duty", "sober_monitor");
  await admin.page.getByRole("button", { name: "Save duty" }).click();
  await expect(admin.page.getByText("Duty added.")).toBeVisible();

  // The brother opens the event while the duty is still assigned, so his page offers "Mark done".
  await brother.page.goto(eventUrl);
  const myRow = brother.page.locator("tr[data-duty-id]").filter({ hasText: BROTHER.name });
  const staleMarkDone = myRow.getByRole("button", { name: "Mark done" });
  await expect(staleMarkDone).toBeVisible();

  // The officer marks it missed.
  await admin.page.goto(eventUrl);
  const adminRow = admin.page.locator("tr[data-duty-id]").filter({ hasText: BROTHER.name });
  await adminRow.getByRole("button", { name: "Missed" }).click();
  await expect(adminRow.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(adminRow.getByRole("button", { name: "Missed" })).toHaveCount(0);

  // Clicking the stale button runs the action, which must refuse: the verdict stands.
  await Promise.all([brother.page.waitForResponse((r) => r.request().method() === "POST"), staleMarkDone.click()]);
  await brother.page.reload();
  await expect(myRow).toContainText("Missed");
  await expect(myRow.getByRole("button")).toHaveCount(0);

  // Once a manager reopens it, the brother may mark it done again.
  await adminRow.getByRole("button", { name: "Reopen" }).click();
  await expect(adminRow.getByRole("button", { name: "Missed" })).toBeVisible();
  await brother.page.reload();
  await expect(myRow.getByRole("button", { name: "Mark done" })).toBeVisible();

  await admin.page.goto(eventUrl);
  admin.page.once("dialog", (d) => d.accept());
  await admin.page.getByRole("button", { name: "Delete" }).click();
  await admin.page.waitForURL(/\/events$/);
  await admin.close();
  await brother.close();
});

test("changing the status from the list card keeps the resolution notes", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const { page } = admin;
  const title = uniq("Dryer");
  const notes = `Replaced the heating element ${title}.`;

  await page.goto("/maintenance");
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.fill("#report-title", title);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.waitForURL(/\/maintenance\/\d+$/);
  const requestUrl = page.url();

  // Resolve with notes on the detail page.
  await page.selectOption("select[name=status]", "resolved");
  await page.fill("textarea[name=resolutionNotes]", notes);
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Marked resolved.")).toBeVisible();
  await expect(page.getByTestId("resolution-notes")).toContainText(notes);

  // Change the status from the list card, which has no notes field.
  await page.goto("/maintenance?tab=resolved");
  const card = page.locator("[data-request-id]").filter({ hasText: title });
  await card.getByText("Manage", { exact: true }).click();
  await card.locator("select[name=status]").selectOption("wont_fix");
  await card.getByRole("button", { name: "Update status" }).click();
  await expect(card.getByText("Marked wont fix.")).toBeVisible();

  // The notes are still there.
  await page.goto(requestUrl);
  await expect(page.getByTestId("request-status")).toContainText(/won.?t fix/i);
  await expect(page.getByTestId("resolution-notes")).toContainText(notes);
  await expect(page.getByText("No notes were left.")).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL(/\/maintenance$/);
  await admin.close();
});

test("posting to an audience that excludes the poster lands on All posts", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const { page } = admin;
  const title = uniq("Pledge info");
  await page.goto("/announcements/new");
  await page.fill("#title", title);
  await page.fill("#body", "Study hours start Monday.");
  await page.selectOption("#audience", "new_members");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.waitForURL(/\/announcements\?all=1$/);
  const card = page.locator("[data-announcement-id]").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText("Not shown to you normally")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await admin.close();
});

test("an RSVP and a duty show up in the brother's calendar feed", async ({ browser }) => {
  const admin = await userPage(browser, ADMIN);
  const brother = await userPage(browser, BROTHER);
  const title = uniq("Feed check");
  const eventUrl = await createEvent(admin.page, title, { startsAt: futureLocal(3, "20:00") });

  await brother.page.goto(eventUrl);
  await brother.page.getByRole("button", { name: "Going", exact: true }).click();
  await expect(brother.page.getByText("You: going")).toBeVisible({ timeout: 30_000 });

  await admin.page.goto(eventUrl);
  await admin.page.getByRole("button", { name: "Add duty" }).click();
  await admin.page.selectOption("#dutyMemberId", { label: BROTHER.name });
  await admin.page.selectOption("#duty", "door");
  await admin.page.fill("#label", "Front door");
  await admin.page.getByRole("button", { name: "Save duty" }).click();
  // A dev server may still be compiling the action; give it room.
  await expect(admin.page.getByText("Duty added.")).toBeVisible({ timeout: 30_000 });

  // The feed link lives on /settings; the feed itself needs no session.
  await brother.page.goto("/settings");
  const url = await brother.page.locator("#calendar-https").inputValue();
  expect(url).toMatch(/\/api\/calendar\/[0-9a-f]{32}$/);
  const anon = await playwrightRequest.newContext();
  const res = await anon.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const ics = (await res.text()).replace(/\r\n[ \t]/g, "");
  expect(ics).toContain(`SUMMARY:${title}`);
  expect(ics).toContain(`SUMMARY:Front door: ${title}`);
  expect(ics).toContain("LOCATION:House basement");
  await anon.dispose();

  // Changing the RSVP to not going drops the event but keeps the duty.
  await brother.page.goto(eventUrl);
  await brother.page.getByRole("button", { name: "Not going", exact: true }).click();
  await expect(brother.page.getByText("You: not going")).toBeVisible({ timeout: 30_000 });
  const again = await playwrightRequest.newContext();
  const after = ((await (await again.get(url)).text()) ?? "").replace(/\r\n[ \t]/g, "");
  expect(after).not.toContain(`SUMMARY:${title}\r\n`);
  expect(after).toContain(`SUMMARY:Front door: ${title}`);
  await again.dispose();

  await admin.page.goto(eventUrl);
  admin.page.once("dialog", (d) => d.accept());
  await admin.page.getByRole("button", { name: "Delete" }).click();
  await admin.page.waitForURL(/\/events$/);
  await admin.close();
  await brother.close();
});
