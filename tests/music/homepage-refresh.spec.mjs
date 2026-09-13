// @ts-check
import { test, expect } from "./test-fixtures.mjs";

test("a cached homepage return refreshes the published music catalog", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-hls", "Chromium qualifies actual history and HTTP cache behavior.");
  await context.unrouteAll({ behavior: "wait" });
  await context.addCookies([{ name: "homepage-fixture", value: "catalog", domain: "localhost", path: "/" }]);
  await context.request.post("/fixture-control/homepage/previous");
  await page.goto("/");
  await expect(page.locator(".arts-preview")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".music-list .music-card")).toHaveCount(3);
  const featured = page.locator('.music-list a[href="/music/soliloquies-vol-ii/"]');
  await expect(featured).toHaveCount(0);
  await page.evaluate(() => {
    window.homepageRestored = false;
    window.addEventListener("pageshow", event => { window.homepageRestored = event.persisted; });
  });
  await page.goto("/healthz");
  await context.request.post("/fixture-control/homepage/current");
  await page.goBack({ waitUntil: "commit" });
  await testInfo.attach("history-return", { body: JSON.stringify(await page.evaluate(() => performance.getEntriesByType("navigation").map(entry => ({ type: entry.type, notRestoredReasons: entry.notRestoredReasons })))), contentType: "application/json" });
  await expect.poll(() => page.evaluate(() => window.homepageRestored)).toBe(true);
  await expect(featured).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(featured).toBeVisible();
  await featured.click();
  await expect(page.getByRole("heading", { name: "Soliloquies Vol. II", exact: true })).toBeVisible();
  await expect(page.locator(".track-title")).toHaveCount(9);
});
