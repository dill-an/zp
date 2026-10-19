import { test, expect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, logout, uniq } from "./helpers";

// Dev servers shared with other agents compile slowly and reload on their saves; give each test room.
test.setTimeout(240_000);

/**
 * Logs in with bounded waits and a few retries instead of the shared helper: on a dev server shared with
 * other agents, a Fast Refresh reload from their saves can wipe the form before submit, and one lost
 * submit should cost seconds rather than the whole test budget.
 */
async function login(page: Page, user: { username: string; password: string } = ADMIN) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto("/login", { waitUntil: "commit" });
      if (/\/dashboard/.test(page.url())) return; // an earlier submit did land
      await page.fill("#username", user.username, { timeout: 15_000 });
      await page.fill("#password", user.password, { timeout: 15_000 });
      await page.click("form button[type=submit]", { timeout: 15_000 });
      await page.waitForURL(/\/dashboard/, { waitUntil: "commit", timeout: 30_000 });
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** The assignee checkbox for a brother, matched by display name on its label. */
function assigneeBox(page: Page, name: string) {
  return page.locator("[data-testid=assignee-list] label", { hasText: name }).first().locator("input[type=checkbox]");
}

/** Wait until React has attached to the task form: in dev mode that is a moment after load, and clicks before it are not tracked. */
async function waitForTaskForm(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("#title")?.closest("form");
    return !!form && Object.keys(form).some((k) => k.startsWith("__reactFiber$"));
  });
}

/** Fill the shared task form. Assignees are matched by display name on the checkbox labels. */
async function fillTaskForm(
  page: Page,
  opts: { title: string; chair?: string; assignees?: string[]; checklist?: string; due?: string; recurrence?: string; priority?: string },
) {
  await waitForTaskForm(page);
  await page.fill("#title", opts.title);
  if (opts.chair) await page.selectOption("#chairId", { label: opts.chair });
  for (const name of opts.assignees ?? []) {
    await assigneeBox(page, name).check();
  }
  if (opts.checklist) await page.fill("#checklist", opts.checklist);
  if (opts.due) await page.fill("#dueAt", opts.due);
  if (opts.recurrence) await page.selectOption("#recurrence", opts.recurrence);
  if (opts.priority) await page.selectOption("#priority", opts.priority);
}

async function submitTaskForm(page: Page) {
  await page.click("form button[type=submit]:has-text('Create task')");
  await page.waitForURL(/\/tasks\/\d+$/, { waitUntil: "commit" });
  const match = page.url().match(/\/tasks\/(\d+)$/);
  return Number(match![1]);
}

test("admin creates a chair task with two assignees and a checklist; the brother works it to done", async ({ page }) => {
  const title = uniq("Plan mixer");
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, {
    title,
    chair: "Social Chair",
    assignees: [BROTHER.name, CLEANER.name],
    checklist: "Pick a date\nBook the room",
    due: "2026-11-05T19:00",
    priority: "high",
  });
  const taskId = await submitTaskForm(page);

  // Detail page shows what was saved: chair, both assignees, checklist, priority.
  await expect(page.locator("h1")).toHaveText(title);
  await expect(page.getByRole("link", { name: "Social Chair" }).first()).toBeVisible();
  await expect(page.getByText("Gio", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Martin", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("checklist-progress")).toHaveText("0/2 done");
  await expect(page.locator("[data-activity-type=assignment]")).toContainText("Gio Mandwee");

  // By chair tab: the task sits under Social Chair.
  await page.goto("/tasks?tab=chair");
  const group = page.locator("[data-testid=chair-group]", { has: page.getByRole("heading", { name: "Social Chair" }) });
  await expect(group.getByRole("link", { name: title })).toBeVisible();

  // The brother sees it on his Mine tab, ticks an item and marks it done.
  await logout(page);
  await login(page, BROTHER);
  await page.goto("/tasks");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL(`**/tasks/${taskId}`, { waitUntil: "commit" });
  await expect(page.getByText("Assigned to you")).toBeVisible();

  // By role: the assignee also sees the Remove button, whose aria-label contains the item text.
  await page.getByRole("checkbox", { name: "Pick a date" }).check();
  await expect(page.getByTestId("checklist-progress")).toHaveText("1/2 done");
  await expect(page.locator("[data-testid=checklist-item][data-done='1']")).toHaveCount(1);

  await page.locator("[data-testid=status-actions] button", { hasText: "Mark done" }).click();
  await expect(page.locator("p[role=status]")).toHaveText("Marked done.");
  await expect(page.locator("[data-testid=task-status-card]").getByText("Done", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-testid=task-status-card]")).toContainText("by Gio");
  await expect(page.locator("[data-activity-type=status]").last()).toContainText("Marked done");

  // Done tab lists it with who finished it; Mine no longer lists it as open.
  await page.goto("/tasks?tab=done");
  const doneRow = page.locator("[data-testid=task-table] tr", { has: page.getByRole("link", { name: title }) });
  await expect(doneRow).toContainText("Done by");
  await expect(doneRow).toContainText("Gio");
  await page.goto("/tasks?tab=mine&status=open");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});

test("assignees ticked before a rejected submit survive it, on the new and the edit form", async ({ page }) => {
  const title = uniq("Keep assignees");
  const tooLong = "x".repeat(5001);
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title, assignees: [BROTHER.name, CLEANER.name] });
  await expect(page.getByText("2 selected")).toBeVisible();
  // The description has no client-side limit, so the server rejects it and React resets the form's DOM.
  await page.fill("#description", tooLong);
  await page.click("form button[type=submit]:has-text('Create task')");
  await expect(page.locator("p[role=alert]")).toContainText("Keep the description under 5000 characters", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/tasks\/new/);
  await expect(assigneeBox(page, BROTHER.name)).toBeChecked();
  await expect(assigneeBox(page, CLEANER.name)).toBeChecked();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.fill("#description", "Short enough.");
  const taskId = await submitTaskForm(page);
  await expect(page.locator("h1")).toHaveText(title);
  await expect(page.getByText("Unassigned")).toHaveCount(0);
  await expect(page.getByText("Gio", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Martin", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-activity-type=assignment]").first()).toContainText("Gio Mandwee, Martin Meister");

  // Edit: an assignee added before a rejected save is kept too, next to the ones already saved.
  await page.goto(`/tasks/${taskId}/edit`);
  await waitForTaskForm(page);
  await expect(assigneeBox(page, BROTHER.name)).toBeChecked();
  await assigneeBox(page, ADMIN.name).check();
  await expect(page.getByText("3 selected")).toBeVisible();
  await page.fill("#description", tooLong);
  await page.click("form button[type=submit]:has-text('Save changes')");
  await expect(page.locator("p[role=alert]")).toContainText("Keep the description under 5000 characters", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/edit$/);
  await expect(assigneeBox(page, ADMIN.name)).toBeChecked();
  await expect(assigneeBox(page, BROTHER.name)).toBeChecked();
  await expect(assigneeBox(page, CLEANER.name)).toBeChecked();
  await expect(page.getByText("3 selected")).toBeVisible();

  await page.fill("#description", "Short enough, edited.");
  await page.click("form button[type=submit]:has-text('Save changes')");
  await page.waitForURL(`**/tasks/${taskId}`, { waitUntil: "commit" });
  await expect(page.getByText("Assigned to you")).toBeVisible();
  await expect(page.getByText("Gio", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Martin", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-activity-type=assignment]").last()).toContainText("Assigned to Dylan Nguyen");
});

test("a brother cannot edit someone else's chair task but can comment", async ({ page }) => {
  const title = uniq("Treasurer only");
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title, chair: "Treasurer" });
  const taskId = await submitTaskForm(page);
  await logout(page);

  await login(page, BROTHER);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.locator("h1")).toHaveText(title);
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByTestId("status-actions")).toHaveCount(0);
  await expect(page.getByText("Only the assignees, the creator and the chair holder can change")).toBeVisible();
  // The edit route bounces back to the task.
  await page.goto(`/tasks/${taskId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}$`));

  const comment = uniq("Comment");
  await page.fill("[data-testid=comment-form] textarea", comment);
  await page.click("[data-testid=comment-form] button[type=submit]");
  await expect(page.locator("[data-activity-type=comment]").last()).toContainText(comment);
});

test("marking a recurring task done creates the next occurrence a week later", async ({ page }) => {
  const title = uniq("Weekly recap");
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title, assignees: [ADMIN.name], due: "2026-10-20T23:59", recurrence: "weekly" });
  const taskId = await submitTaskForm(page);

  await page.locator("[data-testid=status-actions] button", { hasText: "Mark done" }).click();
  const status = page.locator("p[role=status]");
  await expect(status).toContainText("The next occurrence was created as task #");
  const nextId = Number((await status.textContent())!.match(/task #(\d+)/)![1]);
  expect(nextId).toBeGreaterThan(taskId);
  await expect(page.locator("[data-activity-type=status]").last()).toContainText(`Created the next occurrence as task #${nextId}`);

  await page.goto(`/tasks/${nextId}`);
  await expect(page.locator("h1")).toHaveText(title);
  await expect(page.locator("[data-testid=task-status-card]")).toContainText("Oct 27");
  await expect(page.locator("[data-testid=task-status-card]").getByText("To do", { exact: true })).toBeVisible();
  await expect(page.locator("[data-activity-type=created]")).toContainText(`next occurrence of task #${taskId}`);
  await expect(page.getByText("Assigned to you")).toBeVisible();

  // Both occurrences exist: the finished one on Done, the new one on Mine.
  await page.goto("/tasks?tab=mine");
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  await page.goto("/tasks?tab=done");
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
});

test("a plain brother cannot create a task under a chair: control hidden and action rejected", async ({ page }) => {
  await login(page, BROTHER);
  await page.goto("/tasks/new");
  await expect(page.locator("#chairId")).toHaveCount(0);
  await expect(page.getByTestId("chair-locked")).toHaveText("General (no chair)");

  // Forge the chair field anyway; the action must refuse it.
  const title = uniq("Forged chair");
  await page.fill("#title", title);
  await page.evaluate(() => {
    // The task form, not the first form on the page (the sidebar logout form).
    const form = document.querySelector("#title")!.closest("form")!;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "chairId";
    input.value = "1";
    form.appendChild(input);
  });
  await page.click("form button[type=submit]:has-text('Create task')");
  await expect(page.locator("p[role=alert]")).toContainText("Only that chair's holder", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/tasks\/new/);
  await expect(page.locator("#title")).toHaveValue(title);

  // A General task assigned to himself is fine.
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title: uniq("My own"), assignees: [BROTHER.name] });
  const id = await submitTaskForm(page);
  await expect(page.getByText("Assigned to you")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
  await page.goto(`/tasks/${id}/edit`);
  await expect(page.locator("#title")).not.toHaveValue("");
});

test("chair filter narrows every tab", async ({ page }) => {
  const social = uniq("Social filter");
  const rush = uniq("Rush filter");
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title: social, chair: "Social Chair" });
  await submitTaskForm(page);
  await page.goto("/tasks/new");
  const rushId = await page.locator("#chairId option", { hasText: "Rush Chair" }).getAttribute("value");
  const socialId = await page.locator("#chairId option", { hasText: "Social Chair" }).getAttribute("value");
  await fillTaskForm(page, { title: rush, chair: "Rush Chair" });
  await submitTaskForm(page);

  // A bare ?chair= link (as other modules build it) lands on Open filtered to that chair.
  await page.goto(`/tasks?chair=${socialId}`);
  await expect(page.getByRole("link", { name: social })).toBeVisible();
  await expect(page.getByRole("link", { name: rush })).toHaveCount(0);
  await expect(page.locator("nav[aria-label=Sections] a[aria-current=page]")).toHaveText(/Open/);

  await page.goto(`/tasks?tab=chair&chair=${rushId}`);
  await expect(page.getByRole("link", { name: rush })).toBeVisible();
  await expect(page.getByRole("link", { name: social })).toHaveCount(0);
  await expect(page.locator("[data-testid=chair-group]")).toHaveCount(1);

  // Title search and the filter form.
  await page.goto("/tasks?tab=open");
  await page.locator("details summary", { hasText: "Filters" }).click();
  await page.fill("input[name=q]", social);
  await page.click("details form button[type=submit]");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("link", { name: social })).toBeVisible();
  await expect(page.getByRole("link", { name: rush })).toHaveCount(0);
});

test("a chair holder sees unowned tasks on their boards in the Mine tab, counted apart from their assignments", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const boardTitle = uniq("Board task");
  const ownedTitle = uniq("Owned task");
  await login(page, ADMIN);

  // Martin becomes the Historian (a chair without tasks.manage_all) unless a previous run left him there.
  await page.goto("/chairs/historian");
  const holders = page.locator("[data-testid=current-holders]");
  if ((await holders.getByText(CLEANER.name).count()) === 0) {
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", { label: CLEANER.name });
    await page.click("dialog[open] button[type=submit]");
    await expect(holders.getByText(CLEANER.name)).toBeVisible();
  }

  // One task on his board with nobody on it, one owned by Gio: only the first belongs under "On my boards".
  await page.goto("/tasks/new");
  const historianId = await page.locator("#chairId option", { hasText: "Historian" }).getAttribute("value");
  await fillTaskForm(page, { title: boardTitle, chair: "Historian", due: "2026-11-12T18:00" });
  await submitTaskForm(page);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title: ownedTitle, chair: "Historian", assignees: [BROTHER.name] });
  await submitTaskForm(page);
  await logout(page);

  await login(page, CLEANER);
  await page.goto("/tasks");
  await expect(page.getByTestId("mine-counts")).toHaveText(/^\d+ assigned · \d+ on my boards$/);
  const boards = page.getByTestId("my-boards");
  await expect(boards.getByRole("heading", { name: "On my boards (unassigned)" })).toBeVisible();
  await expect(boards.getByRole("link", { name: boardTitle })).toBeVisible();
  // Not in the assigned list above the section, and the owned task is nowhere on Mine.
  await expect(page.getByRole("link", { name: boardTitle })).toHaveCount(1);
  await expect(page.getByRole("link", { name: ownedTitle })).toHaveCount(0);

  // The chair filter narrows the section too; the General bucket never sits on a board.
  await page.goto(`/tasks?tab=mine&chair=${historianId}`);
  await expect(page.getByTestId("my-boards").getByRole("link", { name: boardTitle })).toBeVisible();
  await page.goto("/tasks?tab=mine&chair=general");
  await expect(page.getByTestId("my-boards")).toContainText("Nothing unassigned matches these filters");

  // As the chair holder he can finish it straight from the section.
  await page.goto("/tasks");
  await boards.getByRole("button", { name: `Mark "${boardTitle}" done` }).click();
  await expect(boards.getByRole("link", { name: boardTitle })).toHaveCount(0, { timeout: 30_000 });
  await logout(page);

  // A brother with no chair gets neither the section nor the split counts.
  await login(page, BROTHER);
  await page.goto("/tasks");
  await expect(page.getByTestId("task-cards").first()).toBeAttached();
  await expect(page.getByTestId("my-boards")).toHaveCount(0);
  await expect(page.getByTestId("mine-counts")).toHaveCount(0);
  await logout(page);

  // Leave the chair as we found it.
  await login(page, ADMIN);
  await page.goto("/chairs/historian");
  await holders.locator("li", { hasText: CLEANER.name }).getByRole("button", { name: "End term" }).click();
  await page.waitForURL(/\/chairs\/historian\?ok=/);
  await expect(holders.getByText(CLEANER.name)).toHaveCount(0);
});

test("mobile viewport renders the list as cards with a working quick Done", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = uniq("Phone task");
  await login(page, ADMIN);
  await page.goto("/tasks/new");
  await fillTaskForm(page, { title, assignees: [ADMIN.name], due: "2026-10-01T12:00" });
  await submitTaskForm(page);

  await page.goto("/tasks");
  // The Mine tab renders an open list and, once something is finished, a "Recently finished" list.
  const openCards = page.getByTestId("task-cards").first();
  await expect(openCards).toBeVisible();
  await expect(page.getByTestId("task-table").first()).toBeHidden();
  const card = openCards.locator("li", { has: page.getByRole("link", { name: title }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("overdue");
  await card.getByRole("button", { name: `Mark "${title}" done` }).click();
  await expect(openCards.locator("li", { has: page.getByRole("link", { name: title }) })).toHaveCount(0, { timeout: 30_000 });
  // No horizontal overflow on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
