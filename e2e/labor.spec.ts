import { test, expect as baseExpect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, login, logout, uniq } from "./helpers";

/**
 * Labor module flows. Tests run in order and share one far-future week that is unique to this
 * run (so the suite can run any number of times against the same database) and is deleted at
 * the end. The current week is created via "Copy last week" only if it does not exist yet.
 */

/** A Sunday far in the future, different on every run: 2027-01-03 plus up to ~57 years of weeks. */
function uniqueFutureSunday(): string {
  const base = Date.UTC(2027, 0, 3); // a Sunday
  const weeks = (Math.floor(Date.now() / 1000) * 7 + Math.floor(Math.random() * 7)) % 3000;
  return new Date(base + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

/** Server actions re-render the page; give assertions room on a slow machine. */
const expect = baseExpect.configure({ timeout: 20_000 });

/** A new member outside the labor pool with no part in any request (see docs/specs/README.md). */
const OUTSIDER = { username: "marcos.arroyo-cruz", password: "zetapsi" };

const WEEK = uniqueFutureSunday();
/** A second far-future Sunday for the auto-fill flow, never the same as WEEK. */
const WEEK_AUTO = (() => {
  let w = uniqueFutureSunday();
  while (w === WEEK) w = new Date(Date.parse(`${w}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return w;
})();
const JOB_DONE = "Upstairs Commons"; // Martin: marks done, admin verifies
const JOB_MISSED = "Basement Commons"; // Gio: admin marks missed -> sanction
const JOB_SWAP = "Basement Bathroom"; // Martin -> swap to Gio; Martin's stale excuse must not excuse Gio
const JOB_EXCUSE = "2nd Floor Bathroom"; // Gio: excuse request approved

/** The login page sends signed-in users to the dashboard, so log out before signing in as someone else. */
async function switchUser(page: Page, user: { username: string; password: string }) {
  await logout(page);
  await login(page, user);
}

/**
 * Replace the Clipboard API with a stub that records what was written, so "Copy as text" can be
 * checked without clipboard permissions. Registered before navigation; applies to later page loads.
 */
async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as unknown as { __copied?: string }).__copied = text;
          return Promise.resolve();
        },
      },
    });
  });
}

async function copiedText(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? "");
}

async function assignRow(page: Page, job: string, brotherLabel: string) {
  const row = page.locator(`tr[data-job="${job}"]`);
  await expect(row).toBeVisible();
  await row.locator("select[name=slot_1]").selectOption({ label: brotherLabel });
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();
}

test.describe.serial("labor", () => {
  test("admin opens the current week grid, creating it via Copy last week when needed", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/labor");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Week of");
    const copy = page.getByRole("button", { name: "Copy last week" });
    if (await copy.isVisible()) {
      await copy.click();
      await expect(copy).toBeHidden();
    }
    await expect(page.locator("tr[data-job='Monday Kitchen']")).toBeVisible();
    await expect(page.getByText("Commons", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage" })).toBeVisible();
  });

  test("admin creates a future week and assigns brothers in manage mode", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`/labor/week/${WEEK}`);
    await page.getByRole("button", { name: "Create empty week" }).click();
    await page.waitForURL(new RegExp(`/labor/week/${WEEK}\\?manage=1`));
    await expect(page.getByText("Manage this week")).toBeVisible();
    await assignRow(page, JOB_DONE, CLEANER.name);
    await assignRow(page, JOB_SWAP, CLEANER.name);
    await assignRow(page, JOB_MISSED, BROTHER.name);
    await assignRow(page, JOB_EXCUSE, BROTHER.name);
    // The same brother cannot take both slots of one job; the rejected picks stay in the selects.
    const kitchen = page.locator("tr[data-job='Monday Kitchen']");
    await kitchen.locator("select[name=slot_1]").selectOption({ label: BROTHER.name });
    await kitchen.locator("select[name=slot_2]").selectOption({ label: BROTHER.name });
    await kitchen.getByRole("button", { name: "Save" }).click();
    await expect(kitchen.getByRole("alert")).toContainText("same brother");
    await expect(kitchen.locator("select[name=slot_1] option:checked")).toHaveText(BROTHER.name);
    await expect(kitchen.locator("select[name=slot_2] option:checked")).toHaveText(BROTHER.name);

    // Week notes over the limit are rejected without losing the typed text.
    const tooLong = "n".repeat(2100);
    await page.locator("#week-notes").fill(tooLong);
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /notes/i })).toBeVisible();
    await expect(page.locator("#week-notes")).toHaveValue(tooLong);

    await page.getByRole("link", { name: "Done managing" }).click();
    await page.waitForURL(new RegExp(`/labor/week/${WEEK}$`));
    const doneRow = page.locator(`tr[data-job="${JOB_DONE}"]`);
    await expect(doneRow.getByRole("link", { name: "Martin" })).toBeVisible();
    await expect(doneRow.getByText("Upcoming")).toBeVisible();
  });

  test("cleaner sees the job on My jobs, copies it as text, marks it done and requests a swap and an excuse", async ({ page }) => {
    await stubClipboard(page);
    await login(page, CLEANER);
    await page.goto("/labor/me");
    await expect(page.getByRole("heading", { level: 1, name: "My jobs" })).toBeVisible();
    const card = page.locator(`li[data-week="${WEEK}"][data-job="${JOB_DONE}"]`);
    await expect(card).toBeVisible();
    // The relative due text is separated from the date ("due Wed, Oct 21 · (due in 3 days)"), not glued to it.
    await expect(card.locator("p").filter({ hasText: /due \w{3}, \w{3} \d+ · \(due in \d+ days\)/ })).toBeVisible();

    const copy = page.getByTestId("copy-text");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    const mine = await copiedText(page);
    expect(mine).toContain("Martin Meister: my jobs");
    expect(mine).toContain("Later");
    expect(mine).toContain(`- ${JOB_DONE} (Mon-Wed), due`);
    expect(mine).toContain(`- ${JOB_SWAP} (Sat-Sun), due`);
    await expect(copy).toHaveText("Copy as text");

    await card.getByRole("button", { name: "Mark done" }).click();
    await expect(card.getByText("Done", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Undo" })).toBeVisible();

    // The dialog stays open long enough to show its confirmation, then closes itself.
    const swapCard = page.locator(`li[data-week="${WEEK}"][data-job="${JOB_SWAP}"]`);
    await swapCard.getByRole("button", { name: "Request swap" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("select[name=targetMemberId]").selectOption({ label: BROTHER.name });
    await dialog.locator("textarea[name=reason]").fill("Away that weekend");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog.getByRole("status")).toContainText("Swap requested");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(swapCard.getByText(/waiting for Gio/)).toBeVisible();
    await expect(swapCard.getByRole("button", { name: "Request swap" })).toHaveCount(0);

    // Both requests on the same job: the excuse becomes stale once the swap is approved (next test).
    await swapCard.getByRole("button", { name: "Request excuse" }).click();
    await dialog.locator("textarea[name=reason]").fill("Doctor appointment");
    await dialog.getByRole("button", { name: "Request excuse" }).click();
    await expect(dialog.getByRole("status")).toContainText("Excuse requested");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(swapCard.getByText("Excuse requested")).toBeVisible();

    // A manager cannot approve a swap nobody has accepted yet.
    await switchUser(page, ADMIN);
    await page.goto("/labor/swaps");
    const pending = page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).filter({ has: page.getByRole("button", { name: "Approve" }) });
    await expect(pending.first().getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(pending.first().getByText(/waiting for Gio to accept/)).toBeVisible();
  });

  test("brother accepts the swap and requests an excuse; admin approves both; a stale excuse cannot excuse the new assignee", async ({ page, context }) => {
    await login(page, BROTHER);
    await page.goto("/labor/swaps");
    const row = page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Accept" }).click();
    await expect(page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first().getByText("Awaiting approval")).toBeVisible();

    await page.goto("/labor/me");
    const excuseCard = page.locator(`li[data-week="${WEEK}"][data-job="${JOB_EXCUSE}"]`);
    await excuseCard.getByRole("button", { name: "Request excuse" }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("textarea[name=reason]").fill("Out of town for a family event");
    await dialog.getByRole("button", { name: "Request excuse" }).click();
    await expect(dialog.getByRole("status")).toContainText("Excuse requested");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await switchUser(page, ADMIN);
    // A second tab holds the excuses page from before the swap is approved: its Approve button is live.
    const staleTab = await context.newPage();
    await staleTab.goto("/labor/excuses");
    const staleExcuse = staleTab.locator(`li[data-excuse][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first();
    await expect(staleExcuse.getByRole("button", { name: "Approve" })).toBeEnabled();

    await page.goto("/labor/swaps");
    const pending = page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).filter({ has: page.getByRole("button", { name: "Approve" }) });
    await expect(pending.first().getByRole("button", { name: "Approve" })).toBeEnabled();
    await pending.first().getByRole("button", { name: "Approve" }).click();
    await expect(page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first().getByText("Approved", { exact: true })).toBeVisible();
    await page.goto(`/labor/week/${WEEK}`);
    await expect(page.locator(`tr[data-job="${JOB_SWAP}"]`).getByRole("link", { name: "Gio" })).toBeVisible();

    // Martin's excuse on the job Gio now holds: the server refuses it, the refreshed row says why, and
    // denying with a note still works.
    await staleExcuse.getByRole("button", { name: "Approve" }).click();
    await expect(staleExcuse.getByRole("alert")).toContainText("now holds this job");
    await staleTab.reload();
    await expect(staleExcuse.getByTestId("excuse-stale")).toContainText("Gio");
    await expect(staleExcuse.getByRole("button", { name: "Approve" })).toBeDisabled();
    await staleExcuse.getByLabel("Review note").fill("Job moved to Gio");
    await staleExcuse.getByRole("button", { name: "Deny" }).click();
    await expect(staleTab.locator(`li[data-excuse][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first().getByText(/denied by Dylan Nguyen: Job moved to Gio/)).toBeVisible();
    await staleTab.close();
    await page.goto(`/labor/week/${WEEK}`);
    const swapRow = page.locator(`tr[data-job="${JOB_SWAP}"]`);
    await expect(swapRow.getByRole("link", { name: "Gio" })).toBeVisible();
    await expect(swapRow.getByText("Upcoming")).toBeVisible();
    await expect(swapRow.getByText("Excused")).toHaveCount(0);

    await page.goto("/labor/excuses");
    const excuse = page.locator(`li[data-excuse][data-week="${WEEK}"][data-job="${JOB_EXCUSE}"]`).first();
    await excuse.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator(`li[data-excuse][data-week="${WEEK}"][data-job="${JOB_EXCUSE}"]`).first().getByText("Approved", { exact: true })).toBeVisible();
  });

  test("admin verifies the done job and marks another missed, which issues a sanction", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`/labor/verify?week=${WEEK}`);
    const done = page.locator(`li[data-job="${JOB_DONE}"][data-member="${CLEANER.username}"]`);
    await expect(done.getByText("Done", { exact: true })).toBeVisible();
    await done.getByRole("button", { name: "Verify" }).click();
    await expect(done.getByText("Verified", { exact: true })).toBeVisible();

    const missed = page.locator(`li[data-job="${JOB_MISSED}"][data-member="${BROTHER.username}"]`);
    await missed.getByRole("button", { name: "Mark missed" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator("input[name=issueSanction]")).toBeChecked();
    // The job is due three days into a far-future week: the dialog says when and warns it is not due yet.
    await expect(dialog.getByTestId("missed-due")).toHaveText(/^Due \w{3}, \w{3} \d+, \d{4}$/);
    await expect(dialog.getByTestId("missed-not-due")).toContainText(/This job is not due until \w{3} \d+\./);
    await dialog.getByRole("button", { name: "Mark missed" }).click();
    await expect(dialog.getByRole("status")).toContainText("sanction");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(missed.getByText("Missed", { exact: true })).toBeVisible();
    await expect(missed.getByRole("button", { name: "Mark missed" })).toHaveCount(0);
    await expect(missed.getByTestId("sanction-link")).toContainText("Sanction issued");
    await expect(page.locator(`li[data-job="${JOB_EXCUSE}"][data-member="${BROTHER.username}"]`).getByText("Excused", { exact: true })).toBeVisible();
  });

  test("brothers view shows the job in Martin's row and stats render", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/labor/brothers");
    const row = page.locator(`tr[data-member="${CLEANER.username}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Up Commons" }).first()).toBeVisible();
    await expect(page.locator("th", { hasText: "this week" })).toBeVisible();

    await page.goto("/labor/brothers?view=list&group=cleans&q=meister");
    await expect(page.locator(`li[data-member="${CLEANER.username}"]`)).toBeVisible();
    await expect(page.locator(`li[data-member="${BROTHER.username}"]`)).toHaveCount(0);

    await page.goto("/labor/stats?min=2");
    await expect(page.getByRole("heading", { level: 1, name: "Fairness" })).toBeVisible();
    await expect(page.getByText("Group load")).toBeVisible();
    await expect(page.getByText("Brothers with fewer than 2 jobs")).toBeVisible();
    await expect(page.getByText("Per brother")).toBeVisible();
    await expect(page.getByText("Not tracked", { exact: true })).toBeVisible();
    // Default scope is the cleans group: only its rows, its load row and its threshold list are shown.
    const scopes = page.getByRole("group", { name: "Labor group" });
    await expect(scopes.getByRole("link", { name: "Cleans" })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("tbody[data-section=cleans]")).toBeVisible();
    await expect(page.locator("tbody[data-section=cooks]")).toHaveCount(0);
    await expect(page.locator("tr[data-group=cleans]")).toBeVisible();
    await expect(page.locator("tr[data-group=cooks]")).toHaveCount(0);
    // Names use displayName: "David Santana", never "Santana Santana"; "David Coll", never "David Coll Coll Leon".
    await expect(page.locator("tbody[data-section=cleans]").getByRole("link", { name: "David Santana", exact: true })).toBeVisible();
    await expect(page.getByText("Santana Santana")).toHaveCount(0);
    await expect(page.getByText("Coll Coll Leon")).toHaveCount(0);

    await scopes.getByRole("link", { name: "Cooks" }).click();
    await expect(page).toHaveURL(/group=cooks/);
    await expect(scopes.getByRole("link", { name: "Cooks" })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("tbody[data-section=cooks]")).toBeVisible();
    await expect(page.locator("tbody[data-section=cleans]")).toHaveCount(0);
    await expect(page.locator("tr[data-group=cooks]")).toBeVisible();
    await expect(page.locator("tr[data-group=cleans]")).toHaveCount(0);
    await expect(page.locator(`tbody[data-section=cooks] tr[data-member="${BROTHER.username}"]`)).toBeVisible();

    await page.goto("/labor/stats?group=all&min=3");
    await expect(page.locator("tbody[data-section=cleans]")).toBeVisible();
    await expect(page.locator("tbody[data-section=cooks]")).toBeVisible();
    await expect(page.locator("tr[data-group=cleans]")).toBeVisible();
    await expect(page.locator("tr[data-group=cooks]")).toBeVisible();
    await expect(page.getByText("Brothers with fewer than 3 jobs")).toBeVisible();
  });

  test("steward finds the seeded cook shifts under archived job types and can restore them", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/labor/jobs");
    const row = page.locator('tr[data-jobtype="Dinner cook (Mon)"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText("Meals");
    await expect(row).toContainText("+1d");
    await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
    for (const day of ["Tue", "Wed", "Thu", "Sun"]) await expect(page.locator(`tr[data-jobtype="Dinner cook (${day})"]`).getByRole("button", { name: "Restore" })).toBeVisible();
    // Restore moves it to the active list (Archive offered); archive it again so the suite can repeat.
    await row.getByRole("button", { name: "Restore" }).click();
    await expect(row.getByRole("button", { name: "Archive" })).toBeVisible();
    await row.getByRole("button", { name: "Archive" }).click();
    await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("admin keeps what they typed when a job type fails validation, then creates and deletes it", async ({ page }) => {
    const name = uniq("Porch");
    await login(page, ADMIN);
    await page.goto("/labor/jobs/new");
    await page.locator("#jt-name").fill(name);
    await page.locator("#jt-window").fill("Fri");
    await page.locator("#jt-start").selectOption("5");
    await page.locator("#jt-due").selectOption("2");
    await page.locator("#jt-slots").fill("2");
    await page.locator("#jt-points").fill("3");
    await page.locator("#jt-instructions").fill("Sweep the porch");
    await page.getByRole("button", { name: "Create job type" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "due day cannot be before" })).toBeVisible();
    await expect(page.locator("#jt-name")).toHaveValue(name);
    await expect(page.locator("#jt-window")).toHaveValue("Fri");
    await expect(page.locator("#jt-start")).toHaveValue("5");
    await expect(page.locator("#jt-due")).toHaveValue("2");
    await expect(page.locator("#jt-slots")).toHaveValue("2");
    await expect(page.locator("#jt-points")).toHaveValue("3");
    await expect(page.locator("#jt-instructions")).toHaveValue("Sweep the porch");

    await page.locator("#jt-due").selectOption("6");
    await page.getByRole("button", { name: "Create job type" }).click();
    await page.waitForURL(/\/labor\/jobs$/);
    const row = page.locator(`tr[data-jobtype="${name}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("+5d");
    await expect(row).toContainText("+6d");
    page.on("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(`tr[data-jobtype="${name}"]`)).toHaveCount(0);
  });

  test("plain brother cannot see or reach manage controls, and uninvolved brothers do not see others' swaps", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto(`/labor/week/${WEEK}?manage=1`);
    await expect(page.getByText("Manage this week")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Auto-fill empty slots" })).toHaveCount(0);
    await expect(page.locator("select[name=slot_1]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage" })).toHaveCount(0);
    await page.goto("/labor/jobs");
    await expect(page).toHaveURL(/\/dashboard\?denied=labor\.manage/);
    await page.goto("/labor/verify");
    await expect(page).toHaveURL(/\/dashboard\?denied=labor\.manage/);
    await page.goto("/labor/excuses");
    await expect(page).toHaveURL(/\/dashboard\?denied=labor\.manage/);

    // Gio took the job, so he sees the decision; a brother with no part in it does not.
    await page.goto("/labor/swaps");
    await expect(page.locator(`li[data-swap][data-week="${WEEK}"][data-job="${JOB_SWAP}"]`).first()).toContainText("Away that weekend");
    await switchUser(page, OUTSIDER);
    await page.goto("/labor/swaps");
    await expect(page.getByRole("heading", { level: 1, name: "Swaps" })).toBeVisible();
    await expect(page.locator(`li[data-swap][data-week="${WEEK}"]`)).toHaveCount(0);
    await expect(page.getByText("Away that weekend")).toHaveCount(0);
  });

  test("auto-fill creates a draft that spreads jobs, brothers cannot see it until it is published, and the week copies as text", async ({ page }) => {
    await stubClipboard(page);
    await login(page, ADMIN);
    await page.goto(`/labor/week/${WEEK_AUTO}`);
    await page.getByRole("button", { name: "Auto-fill" }).click();
    await page.waitForURL(new RegExp(`/labor/week/${WEEK_AUTO}\\?manage=1`));
    await expect(page.getByTestId("draft-notice")).toContainText("Draft: review the schedule, then Publish");
    await expect(page.getByText("Draft, not posted")).toBeVisible();
    // Fairness: with the whole pool available nobody gets more than two jobs, and every slot is filled.
    const picked = (await page.locator("tr[data-job] select[name^=slot_] option:checked").allTextContents()).map((t) => t.trim()).filter((t) => t && t !== "Open");
    expect(picked.length).toBeGreaterThan(0);
    const perBrother = new Map<string, number>();
    for (const name of picked) perBrother.set(name, (perBrother.get(name) ?? 0) + 1);
    expect(Math.max(...perBrother.values())).toBeLessThanOrEqual(2);
    await expect(page.locator("tr[data-job] select[name^=slot_] option:checked", { hasText: "Open" })).toHaveCount(0);

    await switchUser(page, BROTHER);
    await page.goto(`/labor/week/${WEEK_AUTO}`);
    await expect(page.getByText("Not posted yet")).toBeVisible();
    await expect(page.locator("tr[data-job]")).toHaveCount(0);

    await switchUser(page, ADMIN);
    await page.goto(`/labor/week/${WEEK_AUTO}?manage=1`);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Week posted." })).toBeVisible();
    await expect(page.getByTestId("draft-notice")).toHaveCount(0);

    await page.goto(`/labor/week/${WEEK_AUTO}`);
    const copy = page.getByTestId("copy-text");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    const text = await copiedText(page);
    expect(text.startsWith("Jobs for the week of ")).toBe(true);
    expect(text).toContain("\n\nCommons\nUpstairs Commons (Mon-Wed): ");
    expect(text).toMatch(/\nMonday Kitchen: [^,\n]+, [^,\n]+\n/);
    expect(text).not.toContain("open");

    page.on("dialog", (d) => d.accept());
    await page.goto(`/labor/week/${WEEK_AUTO}?manage=1`);
    await page.getByRole("button", { name: "Delete week" }).click();
    await page.waitForURL(/\/labor$/);
    await page.goto(`/labor/week/${WEEK_AUTO}`);
    await expect(page.getByRole("button", { name: "Auto-fill" })).toBeVisible();
  });

  test("mobile viewport renders the grid, brothers and stats without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, CLEANER);
    await page.goto("/labor");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Week of");
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return { doc: document.documentElement.scrollWidth - window.innerWidth, main: main.scrollWidth - main.clientWidth };
    });
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.main).toBeLessThanOrEqual(0);
    await page.goto("/labor/brothers");
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow2).toBeLessThanOrEqual(0);
    // The grid scrolls itself so this week's column is in view next to the sticky name column, not the oldest week.
    await expect(page.locator("th[data-current-week]")).toBeAttached();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const grid = document.querySelector<HTMLElement>("[data-testid=brothers-grid]")!;
          const th = grid.querySelector<HTMLElement>("th[data-current-week]")!;
          const sticky = grid.querySelector<HTMLElement>("[data-sticky-col]")!;
          const g = grid.getBoundingClientRect();
          const t = th.getBoundingClientRect();
          return { scrolled: grid.scrollLeft > 0, left: t.left >= g.left + sticky.getBoundingClientRect().width - 1, right: t.right <= g.right + 1 };
        }),
      )
      .toEqual({ scrolled: true, left: true, right: true });
    await page.goto("/labor/stats");
    await expect(page.getByText("Group load")).toBeVisible();
    const overflow3 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow3).toBeLessThanOrEqual(0);
  });

  test("admin resets the test week and deletes it", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(`/labor/verify?week=${WEEK}`);
    for (const job of [JOB_DONE, JOB_MISSED, JOB_EXCUSE]) {
      const row = page.locator(`li[data-job="${job}"]`);
      await row.getByRole("button", { name: "Reset to assigned" }).click();
      await expect(row.getByText("Upcoming")).toBeVisible();
    }
    page.on("dialog", (d) => d.accept());
    await page.goto(`/labor/week/${WEEK}?manage=1`);
    await page.getByRole("button", { name: "Delete week" }).click();
    await page.waitForURL(/\/labor$/);
    await page.goto(`/labor/week/${WEEK}`);
    await expect(page.getByRole("button", { name: "Create empty week" })).toBeVisible();
  });
});
