import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const port = process.env.E2E_PORT ?? "3100";
// A dev or prod server started by hand; when set, Playwright does not start its own server.
const externalBase = process.env.E2E_BASE_URL;
// The cloud sandbox ships its own Chromium; locally Playwright's managed browser is used.
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: externalBase ?? `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: externalBase
    ? undefined
    : {
        command: `npm run db:reset:e2e && DATABASE_PATH=./data/e2e.db PORT=${port} node node_modules/next/dist/bin/next start -p ${port}`,
        url: `http://127.0.0.1:${port}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
