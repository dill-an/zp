import { expect, type Page } from "@playwright/test";

/** Seeded accounts (see src/db/seed-data/roster.ts). The e2e database skips the forced password change. */
export const ADMIN = { username: "dylan.nguyen", password: "zetapsi", name: "Dylan Nguyen" };
/** A brother with no chair: cooks group, Beta Alpha. */
export const BROTHER = { username: "gio.mandwee", password: "zetapsi", name: "Gio Mandwee" };
/** A cleans-group brother with seeded assignments. */
export const CLEANER = { username: "martin.meister", password: "zetapsi", name: "Martin Meister" };

export async function login(page: Page, user: { username: string; password: string } = ADMIN) {
  await page.goto("/login");
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.click("form button[type=submit]");
  await page.waitForURL(/\/dashboard/, { waitUntil: "commit" });
  await expect(page.locator("main")).toBeVisible();
}

export async function logout(page: Page) {
  await page.locator("button[aria-label='Log out']").first().click({ force: true });
  await page.waitForURL(/\/login/, { waitUntil: "commit" });
}

/** Unique suffix so tests can create records without colliding across runs. */
export function uniq(prefix = "e2e") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}
