import { test, expect } from "@playwright/test";
import { ADMIN, login, logout } from "./helpers";

test("redirects to login when logged out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("rejects a wrong password and keeps the username", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#username", ADMIN.username);
  await page.fill("#password", "wrong-password");
  await page.click("form button[type=submit]");
  await expect(page.locator("p[role=alert]")).toHaveText("Wrong username or password.");
  await expect(page.locator("#username")).toHaveValue(ADMIN.username);
});

test("logs in, shows the shell and logs out", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(ADMIN.name).first()).toBeVisible();
  await logout(page);
  await expect(page).toHaveURL(/\/login/);
});

test("mobile menu navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, ADMIN);
  await page.click("button[aria-label='Open menu']");
  await page.locator("aside.fixed a[href='/labor'], aside a[href='/labor']").last().click();
  await expect(page).toHaveURL(/\/labor/);
});
