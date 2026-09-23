// @ts-check
import { test, expect } from "./test-fixtures.mjs";

const titles = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];

for (const width of [390, 1280]) {
  test(`Alpha Drift presents ten recordings without platform links at ${width}px`, async ({ page, context }) => {
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    await context.addCookies([{ name: "music-fixture", value: "recordings", domain: "localhost", path: "/" }]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator('.music-list a[href="/music/alpha-drift/"]').first().click();
    await expect(page.getByRole("heading", { name: "Alpha Drift", exact: true })).toBeVisible();
    await expect(page.locator(".album-meta-large")).toHaveText("Latest Release • 2026 • 10 Tracks");
    await expect(page.locator(".track-title")).toHaveText(titles);
    await expect(page.locator(".streaming-links")).toHaveCount(0);
    await expect(page.locator("button[data-play-track]")).toHaveCount(10);
    await expect.poll(() => page.locator('img[src="/music/covers/alpha-drift.png"]').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/alpha-drift-${width}-${test.info().project.name}.png`, fullPage: true });
    await page.goto("/music/soliloquies-vol-ii/");
    await expect(page.locator(".album-meta-large")).toHaveText("2026 • 9 Tracks");
  });
}
