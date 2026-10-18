// Throwaway config for the community agent's e2e run on a heavily loaded shared box.
// Same browser as playwright.config.ts, but memory-lean Chromium flags, longer timeouts
// and a private output dir. Deleted before hand-off.
import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// The headless shell is a much smaller binary than full Chromium; every megabyte matters in the shared cgroup.
const headlessShell = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync(headlessShell) ? headlessShell : fs.existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /community\.spec\.ts/,
  timeout: 900_000,
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
      args: ["--no-zygote", "--renderer-process-limit=1", "--js-flags=--max-old-space-size=256", "--disable-gpu", "--disable-dev-shm-usage"],
    },
    navigationTimeout: 180_000,
    actionTimeout: 120_000,
    trace: "off",
    screenshot: "off",
  },
});
