// Throwaway config for the community agent's e2e run on a heavily loaded shared box.
// Same browser as playwright.config.ts, but memory-lean Chromium flags, longer timeouts
// and a private output dir. Deleted before hand-off.
import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /community\.spec\.ts/,
  timeout: 420_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  outputDir: "/tmp/claude-0/-home-user-zp/aebb2461-bb2d-5cde-a3c6-0c91da689555/scratchpad/test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3107",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--single-process", "--no-zygote", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256", "--disable-gpu"],
    },
    navigationTimeout: 180_000,
    actionTimeout: 120_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
