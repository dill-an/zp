import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // The cloud sandbox ships its own Chromium; locally Playwright's managed browser is used.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `DATABASE_PATH=./data/e2e.db npm run db:reset:e2e && DATABASE_PATH=./data/e2e.db PORT=${port} npm run start`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
