// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "..",
  testMatch: ["music/*.spec.mjs", "gallery/*.spec.mjs", "site/*.spec.mjs"],
  outputDir: "../../output/playwright/music-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["json", { outputFile: "../../output/playwright/music-results.json" }]],
  use: { headless: true, baseURL: "https://localhost:18443", ignoreHTTPSErrors: true, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "chromium-hls", use: { browserName: "chromium", channel: "chromium", launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] } }, metadata: { forceHls: true } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "node tests/music/serve-fixture.mjs", cwd: "../..",
    url: "https://localhost:18443/healthz", ignoreHTTPSErrors: true,
    reuseExistingServer: false, timeout: 60000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
  },
});
