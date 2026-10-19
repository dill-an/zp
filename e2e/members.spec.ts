import { test, expect, type Page } from "@playwright/test";
import { ADMIN, BROTHER, CLEANER, logout, uniq } from "./helpers";

// Dev servers shared with other agents compile slowly; give each test room.
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

/** Lowercase alphanumeric tag (no dashes) so it survives slugging into usernames and chair slugs. */
function tag(prefix = "zz") {
  return uniq(prefix).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const TEMP_PASSWORD = "Temp-pass-1234";

/** Admin creates a member through the UI; returns what the test needs to log in as them. */
async function createMember(page: Page, t: string) {
  const firstName = "Zed";
  const lastName = `Tester${t}`;
  await page.goto("/members/new");
  await page.fill("#firstName", firstName);
  await page.fill("#lastName", lastName);
  await expect(page.locator("#username")).toHaveValue(`zed.tester${t}`);
  await page.fill("#temporaryPassword", TEMP_PASSWORD);
  await page.selectOption("#status", "active");
  await page.selectOption("#laborGroup", "cooks");
  await page.fill("#phone", "617-555-0100");
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/members\/\d+\?created=1/);
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  return { id, firstName, lastName, name: `${firstName} ${lastName}`, username: `zed.tester${t}`, password: TEMP_PASSWORD };
}

test.describe("roster", () => {
  test("lists seeded brothers and filters by pledge class and labor group", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.locator("[data-testid=roster-table]").getByText(BROTHER.name)).toBeVisible();
    await expect(page.locator("[data-testid=roster-table]").getByText(CLEANER.name)).toBeVisible();
    await expect(page.locator("[data-testid=roster-table]").getByText("Felipe Abreu")).toBeVisible();

    // Pledge class filter: Beta Alpha keeps Gio and Martin, drops Felipe (Psi).
    await page.selectOption("select[name=class]", { label: "Beta Alpha" });
    await page.waitForURL(/\/members\?.*class=\d+/);
    const table = page.locator("[data-testid=roster-table]");
    await expect(table.getByText(BROTHER.name)).toBeVisible();
    await expect(table.getByText(CLEANER.name)).toBeVisible();
    await expect(table.getByText("Felipe Abreu")).toHaveCount(0);

    // Labor group filter on top: cleans keeps Martin, drops Gio (cooks).
    await page.selectOption("select[name=group]", "cleans");
    await page.waitForURL(/\/members\?.*group=cleans/);
    await expect(table.getByText(CLEANER.name)).toBeVisible();
    await expect(table.getByText(BROTHER.name)).toHaveCount(0);

    // Search by username.
    await page.goto("/members?q=gio.mandwee");
    await expect(table.getByText(BROTHER.name)).toBeVisible();
    await expect(table.getByText(CLEANER.name)).toHaveCount(0);
  });

  test("plain brother sees the roster without manage controls", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto("/members");
    await expect(page.locator("[data-testid=roster-table]").getByText(ADMIN.name)).toBeVisible();
    await expect(page.getByRole("link", { name: "Add member" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
    await expect(page.locator("[data-testid=roster-table] th", { hasText: "Role" })).toHaveCount(0);
  });

  test("mobile viewport renders the roster as cards", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, ADMIN);
    await page.goto("/members");
    const cards = page.locator("[data-testid=roster-cards]");
    await expect(cards).toBeVisible();
    await expect(cards.getByText(BROTHER.name)).toBeVisible();
    await expect(page.locator("[data-testid=roster-table]")).toBeHidden();
  });

  test("CSV export responds with text/csv for an admin and 403 for a brother", async ({ page }) => {
    await login(page, ADMIN);
    const res = await page.request.get("/members/export?group=cooks");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.split("\n")[0]).toContain("First name,Last name,Preferred name,Username");
    expect(body).toContain("gio.mandwee");
    expect(body).not.toContain("martin.meister");
    await logout(page);
    await login(page, BROTHER);
    const denied = await page.request.get("/members/export");
    expect(denied.status()).toBe(403);
  });
});

test.describe("roster hygiene", () => {
  test("members.manage sees who has no pledge class, with a link to fix it; the roster marks them with a pill", async ({ page }) => {
    await login(page, ADMIN);
    const t = tag("nc");
    // createMember picks no pledge class.
    const m = await createMember(page, t);

    await page.goto(`/members?q=${t}`);
    const table = page.locator("[data-testid=roster-table]");
    await expect(table.locator("tr", { hasText: m.name }).getByText("No class", { exact: true })).toBeVisible();
    const notice = page.locator("[data-testid=roster-hygiene]");
    await expect(notice).toContainText("no pledge class");
    await expect(notice.getByRole("link", { name: m.name })).toHaveAttribute("href", `/members/${m.id}/edit`);

    // The phone card carries the same pill.
    await page.setViewportSize({ width: 390, height: 844 });
    const cards = page.locator("[data-testid=roster-cards]");
    await expect(cards.locator("li", { hasText: m.name }).getByText("No class", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    // Fix it from the notice: the link opens the edit page, and afterwards the brother drops out of the list.
    await notice.getByRole("link", { name: m.name }).click();
    await page.waitForURL(new RegExp(`/members/${m.id}/edit`));
    await page.selectOption("#pledgeClassId", { label: "Beta Beta" });
    await page.click("main form button[type=submit]");
    await page.waitForURL(/\/members\/\d+\?saved=1/);
    await page.goto(`/members?q=${t}`);
    await expect(table.locator("tr", { hasText: m.name })).toContainText("Beta Beta");
    await expect(table.getByText("No class", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-testid=roster-hygiene]").getByRole("link", { name: m.name })).toHaveCount(0);
    await logout(page);

    // A plain brother sees the pill on the roster but never the hygiene notice.
    await login(page, BROTHER);
    await page.goto("/members");
    await expect(page.locator("[data-testid=roster-table]")).toBeVisible();
    await expect(page.locator("[data-testid=roster-hygiene]")).toHaveCount(0);
  });
});

test.describe("members: admin flows", () => {
  test("admin adds a member and the new member logs in with the temporary password", async ({ page }) => {
    await login(page, ADMIN);
    const t = tag("m");
    const m = await createMember(page, t);
    await expect(page.getByRole("heading", { name: m.name })).toBeVisible();
    await expect(page.getByText(`@${m.username}`)).toBeVisible();
    await expect(page.locator("[data-testid=profile-pills]").getByText("Active")).toBeVisible();

    // Appears on the roster.
    await page.goto(`/members?q=${t}`);
    await expect(page.locator("[data-testid=roster-table]").getByText(m.name)).toBeVisible();

    await logout(page);
    await login(page, { username: m.username, password: m.password });
    await expect(page.getByText("Set your password")).toBeVisible();
  });

  test("admin cannot reuse a username and gets a suggestion", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/members/new");
    await page.fill("#firstName", "Gio");
    await page.fill("#lastName", "Mandwee");
    await page.fill("#temporaryPassword", TEMP_PASSWORD);
    await page.click("main form button[type=submit]");
    await expect(page.locator("p[role=alert]")).toContainText("taken");
    await expect(page.locator("#firstName")).toHaveValue("Gio");
  });

  test("plain brother cannot open /members/new or edit someone else", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto("/members/new");
    await expect(page).toHaveURL(/\/dashboard\?denied=members\.manage/);
    await page.goto("/members/classes");
    await expect(page).toHaveURL(/\/dashboard\?denied=members\.manage/);
    await page.goto("/members/me");
    await page.waitForURL(/\/members\/\d+$/);
    const ownId = Number(new URL(page.url()).pathname.split("/").pop());
    await page.goto(`/members/${ownId === 1 ? 2 : 1}/edit`);
    await expect(page).toHaveURL(/\/dashboard\?denied=members\.manage/);
  });

  test("admin manages pledge classes: add, edit, delete when empty", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, ADMIN);
    await page.goto("/members/classes");
    await expect(page.getByRole("cell", { name: "Beta Beta" })).toBeVisible();
    const name = `Class ${tag("c")}`;
    await page.getByRole("button", { name: "Add class" }).click();
    await page.fill("dialog[open] #pc-name", name);
    await page.fill("dialog[open] #pc-semesterLabel", "Spring 2027");
    await page.click("dialog[open] button[type=submit]");
    const row = page.locator("tr", { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Spring 2027");

    await row.getByRole("button", { name: "Edit" }).click();
    await page.fill("dialog[open] #pc-semesterLabel", "Fall 2027");
    await page.click("dialog[open] button[type=submit]");
    await expect(row).toContainText("Fall 2027");

    await row.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/members\/classes\?ok=/);
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0);
  });
});

test.describe("self service", () => {
  test("a brother edits their own phone", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto("/members/me");
    await page.waitForURL(/\/members\/\d+$/);
    await expect(page.getByRole("heading", { name: BROTHER.name })).toBeVisible();
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/members\/\d+\/edit/);
    // Self-edit form hides manage-only fields.
    await expect(page.locator("#status")).toHaveCount(0);
    await expect(page.locator("#role")).toHaveCount(0);
    const phone = `617-555-${String(Date.now()).slice(-4)}`;
    await page.fill("#phone", phone);
    await page.click("main form button[type=submit]");
    await page.waitForURL(/\/members\/\d+\?saved=1/);
    await expect(page.locator("[data-testid=profile-phone]")).toHaveText(phone);
    // Private fields are visible to the member themselves.
    await expect(page.getByText("Emergency contact")).toBeVisible();
  });

  test("a brother does not see another brother's private fields or admin notes", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto("/members?q=martin");
    await page.locator("[data-testid=roster-table]").getByRole("link", { name: CLEANER.name }).click();
    await page.waitForURL(/\/members\/\d+$/);
    await expect(page.getByRole("heading", { name: CLEANER.name })).toBeVisible();
    await expect(page.getByText("Emergency contact")).toHaveCount(0);
    await expect(page.getByText("Admin notes")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  });
});

test.describe("chairs", () => {
  test("everyone sees chairs grouped by category with task counts", async ({ page }) => {
    await login(page, BROTHER);
    await page.goto("/chairs");
    await expect(page.getByRole("heading", { name: "Executive board" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Treasurer", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add chair" })).toHaveCount(0);
    await page.getByRole("link", { name: "Treasurer", exact: true }).click();
    await page.waitForURL(/\/chairs\/treasurer/);
    await expect(page.getByText("Set dues amounts and due dates each semester")).toBeVisible();
    await expect(page.getByRole("link", { name: "View tasks" })).toHaveAttribute("href", /\/tasks\?chair=\d+/);
    await expect(page.getByRole("button", { name: "Assign holder" })).toHaveCount(0);
    await expect(page.locator("[data-testid=new-task-link]")).toHaveCount(0);
  });

  test("admin creates a chair, assigns a holder, the holder sees officer controls, then ends the term", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, ADMIN);
    const t = tag("ch");
    const member = await createMember(page, t);

    // Create the chair; the slug is suggested from the name.
    const chairName = `Test Chair ${t}`;
    const slug = `test_chair_${t}`;
    await page.goto("/chairs/new");
    await page.fill("#name", chairName);
    await expect(page.locator("#slug")).toHaveValue(slug);
    await page.selectOption("#category", "internal");
    await page.fill("#description", "Temporary chair created by the e2e suite.");
    await page.fill("#responsibilities", "First duty\nSecond duty");
    await page.click("main form button[type=submit]");
    await page.waitForURL(new RegExp(`/chairs/${slug}`));
    await expect(page.getByRole("heading", { name: chairName })).toBeVisible();
    await expect(page.getByText("Second duty")).toBeVisible();
    await expect(page.getByText("Unassigned.")).toBeVisible();

    // Assign the new member.
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(member.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("[data-testid=current-holders]").getByText(member.name)).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // The profile shows the chair; roster filters by chair holders.
    await page.goto(`/members/${member.id}`);
    await expect(page.locator("[data-testid=profile-pills]").getByText(chairName)).toBeVisible();
    await expect(page.locator("[data-testid=profile-pills]").getByText("Officer")).toBeVisible();
    await page.goto(`/members?chairs=1&q=${t}`);
    await expect(page.locator("[data-testid=roster-table]").getByText(member.name)).toBeVisible();

    // The holder logs in: sidebar role label shows the chair, and after setting a password they get New task.
    await logout(page);
    await login(page, { username: member.username, password: member.password });
    await expect(page.locator("aside").getByText(new RegExp(`test chair ${t}`, "i"))).toBeVisible();
    await expect(page.getByText("Set your password")).toBeVisible();
    await page.fill("#currentPassword", member.password);
    await page.fill("#newPassword", "Brand-new-pass-1");
    await page.fill("#confirmPassword", "Brand-new-pass-1");
    await page.click("main form button[type=submit]");
    await expect(page.getByText("Set your password")).toHaveCount(0);
    await page.goto(`/chairs/${slug}`);
    await expect(page.getByText("You hold this chair")).toBeVisible();
    await expect(page.locator("[data-testid=new-task-link]")).toHaveAttribute("href", /\/tasks\/new\?chair=\d+/);
    await expect(page.getByRole("button", { name: "Assign holder" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit chair" })).toHaveCount(0);
    await page.goto("/members/new");
    await expect(page).toHaveURL(/\/dashboard\?denied=members\.manage/);

    // Admin ends the term: history records it and the role drops back to member.
    await logout(page);
    await login(page, ADMIN);
    await page.goto(`/chairs/${slug}`);
    await page.getByRole("button", { name: "End term" }).click();
    await page.waitForURL(new RegExp(`/chairs/${slug}\\?ok=`));
    await expect(page.getByText("Unassigned.")).toBeVisible();
    await expect(page.locator("table", { hasText: "Brother" }).getByText(member.name)).toBeVisible();
    await page.goto(`/members/${member.id}`);
    await expect(page.locator("[data-testid=profile-pills]").getByText("Member", { exact: true })).toBeVisible();
    await expect(page.getByText(/to \w{3} \d{1,2}, \d{4}/)).toBeVisible();

    // Edit the chair: deactivating hides it from the list unless ?all=1.
    await page.goto(`/chairs/${slug}/edit`);
    await page.getByLabel("Active").uncheck();
    await page.click("main form button[type=submit]");
    await page.waitForURL(new RegExp(`/chairs/${slug}\\?ok=`));
    await page.goto("/chairs");
    await expect(page.getByRole("link", { name: chairName })).toHaveCount(0);
    await page.goto("/chairs?all=1");
    await expect(page.getByRole("link", { name: chairName })).toBeVisible();

    // An inactive chair takes no holders: the dialog is gone and the action refuses a re-pointed form.
    await page.goto(`/chairs/${slug}`);
    await expect(page.getByRole("button", { name: "Assign holder" })).toHaveCount(0);
    await expect(page.getByText("Inactive chairs cannot take holders.")).toBeVisible();
    const inactiveChairId = Number(new URL(await page.getByRole("link", { name: "View tasks" }).getAttribute("href").then((h) => h ?? ""), "http://x").searchParams.get("chair"));
    expect(inactiveChairId).toBeGreaterThan(0);
    await page.goto("/chairs/historian");
    await page.getByRole("button", { name: "Assign holder" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.locator("dialog[open] input[name=chairId]").evaluate((el, id) => ((el as HTMLInputElement).value = String(id)), inactiveChairId);
    await page.selectOption("dialog[open] #memberId", String(member.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("dialog[open] p[role=alert]")).toContainText("is inactive. Activate the chair before assigning a holder.");
    await page.goto(`/members/${member.id}`);
    await expect(page.locator("[data-testid=profile-pills]").getByText(chairName)).toHaveCount(0);
  });

  test("co-chair assignment keeps the current holder", async ({ page }) => {
    await login(page, ADMIN);
    const t = tag("co");
    const a = await createMember(page, `${t}a`);
    const b = await createMember(page, `${t}b`);
    const chairName = `Co Chair ${t}`;
    await page.goto("/chairs/new");
    await page.fill("#name", chairName);
    await page.click("main form button[type=submit]");
    await page.waitForURL(new RegExp(`/chairs/co_chair_${t}`));

    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(a.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("[data-testid=current-holders]").getByText(a.name)).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(b.id));
    await page.fill("dialog[open] #title", "Co-chair");
    await page.locator("dialog[open] input[name=keepCurrent]").check();
    await page.click("dialog[open] button[type=submit]");
    const holders = page.locator("[data-testid=current-holders]");
    await expect(holders.getByText(a.name)).toBeVisible();
    await expect(holders.getByText(b.name)).toBeVisible();
    await expect(holders.getByText("Co-chair")).toBeVisible();

    // Replacing without the co-chair box ends both terms.
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const c = await createMember(page, `${t}c`);
    await page.goto(`/chairs/co_chair_${t}`);
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(c.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(holders.getByText(c.name)).toBeVisible();
    await expect(holders.getByText(a.name)).toHaveCount(0);
    await expect(holders.getByText(b.name)).toHaveCount(0);
  });
});

/* Regression tests for the review findings (members-1 to members-4). */
test.describe("review regressions", () => {
  test("a secretary with members.manage cannot reset, deactivate or lock out an admin", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, ADMIN);
    await page.goto("/members/me");
    await page.waitForURL(/\/members\/\d+$/);
    const adminId = Number(new URL(page.url()).pathname.split("/").pop());
    const t = tag("sec");
    const sec = await createMember(page, t);
    const target = await createMember(page, `${t}t`);

    // The secretary chair grants members.manage (this replaces whoever held it).
    await page.goto("/chairs/secretary");
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(sec.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("[data-testid=current-holders]").getByText(sec.name)).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await logout(page);
    await login(page, { username: sec.username, password: sec.password });
    await expect(page.getByText("Set your password")).toBeVisible();
    await page.fill("#currentPassword", sec.password);
    await page.fill("#newPassword", "Brand-new-pass-1");
    await page.fill("#confirmPassword", "Brand-new-pass-1");
    await page.click("main form button[type=submit]");
    await expect(page.getByText("Set your password")).toHaveCount(0);

    // They do hold members.manage: Add member opens and a plain member shows the account buttons.
    await page.goto("/members/new");
    await expect(page.getByRole("heading", { name: "Add member" })).toBeVisible();
    await page.goto(`/members/${target.id}`);
    await expect(page.getByRole("button", { name: "Reset password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible();

    // On the admin's profile only Edit remains, and the edit form locks status and role.
    await page.goto(`/members/${adminId}`);
    await expect(page.getByRole("heading", { name: ADMIN.name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await page.goto(`/members/${adminId}/edit`);
    await expect(page.locator("#status")).toBeDisabled();
    await expect(page.locator("#role")).toBeDisabled();
    await expect(page.locator("#username")).toHaveJSProperty("readOnly", true);

    // The server refuses as well. Unlock the fields by hand (once React has hydrated them) and try.
    const hydrated = () => Object.keys(document.querySelector("#status") ?? {}).some((k) => k.startsWith("__reactFiber"));
    await page.waitForFunction(hydrated);
    await page.locator("#username").evaluate((el) => ((el as HTMLInputElement).readOnly = false));
    await page.fill("#username", `owned.by.${t}`);
    await page.click("main form button[type=submit]");
    await expect(page.locator("p[role=alert]")).toContainText("Only an admin can change another admin's username.");
    await page.goto(`/members/${adminId}/edit`);
    await page.waitForFunction(hydrated);
    await page.locator("input[type=hidden][name=status]").evaluate((el) => ((el as HTMLInputElement).name = "statusLocked"));
    await page.locator("#status").evaluate((el) => ((el as HTMLSelectElement).disabled = false));
    await page.selectOption("#status", "inactive");
    await page.click("main form button[type=submit]");
    await expect(page.locator("p[role=alert]")).toContainText("Only an admin can change another admin's status.");

    // Re-point the reset dialog rendered for the plain member at the admin.
    await page.goto(`/members/${target.id}`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    // Type first: React re-applies the hidden input's value prop on every re-render of the dialog form.
    await page.fill("dialog[open] #temporaryPassword", "Owned-by-sec-1");
    await page.locator("dialog[open] input[name=memberId]").evaluate((el, id) => ((el as HTMLInputElement).value = String(id)), adminId);
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("dialog[open] p[role=alert]")).toContainText("Only an admin can reset another admin's password.");
    await page.locator("dialog[open] button[aria-label=Close]").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // Same for the Deactivate form.
    const deactivate = page.locator("form", { has: page.getByRole("button", { name: "Deactivate" }) });
    await deactivate.locator("input[name=memberId]").evaluate((el, id) => ((el as HTMLInputElement).value = String(id)), adminId);
    await page.getByRole("button", { name: "Deactivate" }).click();
    await page.waitForURL(new RegExp(`/members/${adminId}\\?error=`));
    await expect(page.locator("p[role=alert]")).toContainText("Only an admin can change another admin's status.");
    await expect(page.locator("[data-testid=profile-pills]").getByText("Active", { exact: true })).toBeVisible();

    // The admin still logs in with their own password.
    await logout(page);
    await login(page, ADMIN);
  });

  test("a failed submit keeps the selects on the member form and in the assign dialog", async ({ page }) => {
    await login(page, ADMIN);
    const t = tag("sel");
    const name = `Zed Keeper${t}`;
    await page.goto("/members/new");
    await page.fill("#firstName", "Zed");
    await page.fill("#lastName", `Keeper${t}`);
    await page.fill("#temporaryPassword", TEMP_PASSWORD);
    await page.selectOption("#pledgeClassId", { label: "Beta Beta" });
    const classId = await page.locator("#pledgeClassId").inputValue();
    expect(classId).not.toBe("");
    await page.selectOption("#status", "abroad");
    await page.selectOption("#laborGroup", "cleans");
    await page.fill("#phone", "617-555-0001");
    // A taken username: the action fails and every choice must survive React's form reset.
    await page.fill("#username", BROTHER.username);
    await page.click("main form button[type=submit]");
    await expect(page.locator("p[role=alert]")).toContainText("taken");
    await expect(page.locator("#pledgeClassId")).toHaveValue(classId);
    await expect(page.locator("#status")).toHaveValue("abroad");
    await expect(page.locator("#laborGroup")).toHaveValue("cleans");
    await expect(page.locator("#phone")).toHaveValue("617-555-0001");

    // Fixing the username (and re-typing the password, which is never echoed back) creates the member with what was picked.
    await page.fill("#username", `zed.keeper${t}`);
    await page.fill("#temporaryPassword", TEMP_PASSWORD);
    await page.click("main form button[type=submit]");
    await page.waitForURL(/\/members\/\d+\?created=1/);
    const id = Number(new URL(page.url()).pathname.split("/").pop());
    const pills = page.locator("[data-testid=profile-pills]");
    await expect(pills.getByText("Abroad")).toBeVisible();
    await expect(pills.getByText("Cleans group")).toBeVisible();
    await expect(page.locator("main").getByText("Beta Beta")).toBeVisible();

    // The edit form: a taken username must not undo a status change.
    await page.goto(`/members/${id}/edit`);
    await page.selectOption("#status", "active");
    await page.fill("#username", BROTHER.username);
    await page.click("main form button[type=submit]");
    await expect(page.locator("p[role=alert]")).toContainText("taken");
    await expect(page.locator("#status")).toHaveValue("active");
    await page.fill("#username", `zed.keeper${t}`);
    await page.click("main form button[type=submit]");
    await page.waitForURL(/\/members\/\d+\?saved=1/);
    await expect(pills.getByText("Active", { exact: true })).toBeVisible();

    // The assign dialog: the brother stays picked after the server rejects the submit.
    await page.goto("/chairs/new");
    await page.fill("#name", `Keep Chair ${t}`);
    await page.click("main form button[type=submit]");
    await page.waitForURL(new RegExp(`/chairs/keep_chair_${t}`));
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("[data-testid=current-holders]").getByText(name)).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("dialog[open] p[role=alert]")).toContainText("already holds");
    await expect(page.locator("dialog[open] #memberId")).toHaveValue(String(id));
  });

  test("deactivating a chair holder ends their term and drops the officer role", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await login(page, ADMIN);
    const t = tag("de");
    const m = await createMember(page, t);
    const chairName = `Gone Chair ${t}`;
    await page.goto("/chairs/new");
    await page.fill("#name", chairName);
    await page.click("main form button[type=submit]");
    await page.waitForURL(new RegExp(`/chairs/gone_chair_${t}`));
    await page.getByRole("button", { name: "Assign holder" }).click();
    await page.selectOption("dialog[open] #memberId", String(m.id));
    await page.click("dialog[open] button[type=submit]");
    await expect(page.locator("[data-testid=current-holders]").getByText(m.name)).toBeVisible();

    await page.goto(`/members/${m.id}`);
    const pills = page.locator("[data-testid=profile-pills]");
    await expect(pills.getByText("Officer")).toBeVisible();
    await page.getByRole("button", { name: "Deactivate" }).click();
    await page.waitForURL(new RegExp(`/members/${m.id}\\?ok=`));
    await expect(page.locator("p[role=status]")).toContainText(`Ended their term as ${chairName}`);
    await expect(pills.getByText("Inactive")).toBeVisible();
    await expect(pills.getByText("Member", { exact: true })).toBeVisible();
    await expect(pills.getByText(chairName)).toHaveCount(0);

    // The chair is unassigned and the term shows up in history; the roster's chair-holders filter drops them.
    await page.goto(`/chairs/gone_chair_${t}`);
    await expect(page.getByText("Unassigned.")).toBeVisible();
    await expect(page.locator("table", { hasText: "Brother" }).getByText(m.name)).toBeVisible();
    await page.goto(`/members?chairs=1&all=1&q=${t}`);
    await expect(page.getByText(m.name)).toHaveCount(0);

    // An inactive brother cannot be handed a chair again until reactivated.
    await page.goto(`/chairs/gone_chair_${t}`);
    await page.getByRole("button", { name: "Assign holder" }).click();
    await expect(page.locator("dialog[open] #memberId option", { hasText: m.name })).toHaveCount(0);
  });
});
