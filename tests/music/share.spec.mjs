// @ts-check
import { test, expect } from "./test-fixtures.mjs";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "music-fixture", value: "player", domain: "localhost", path: "/" }]);
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
});

for (const scenario of [
  { mode: "copy", label: "Link copied", success: true },
  { mode: "denied", label: "Could not copy link", success: false },
  { mode: "unavailable", label: "Sharing unavailable", success: false },
]) {
  test(`track sharing reports ${scenario.mode} accurately`, async ({ page }) => {
    await page.addInitScript((mode) => {
      window.shareCalls = [];
      Object.defineProperty(navigator, "clipboard", { configurable: true, value:
        mode === "unavailable" ? undefined : { writeText: async (url) => {
          window.shareCalls.push({ method: "copy", url });
          if (mode === "denied") throw new DOMException("Copy rejected", "NotAllowedError");
        } },
      });
    }, scenario.mode);
    await page.goto("/music/soliloquies-vol-i/");
    await page.locator(".track-play").first().click();
    const button = page.locator('#music-player [data-action="share"]');
    await expect(button).toBeEnabled();
    const original = await button.innerHTML();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await button.click();
    await expect(button).toHaveAttribute("aria-label", scenario.label);
    await expect(button).toHaveAttribute("title", scenario.label);
    if (scenario.success) await expect(button).toHaveClass(/is-copied/);
    else await expect(button).not.toHaveClass(/is-copied/);
    if (!scenario.success) await expect(button.locator("polyline")).toHaveCount(0);
    expect(await page.evaluate(() => window.shareCalls)).toEqual(scenario.mode === "unavailable" ? [] : [{
      method: "copy",
      url: `${new URL(page.url()).origin}/music/soliloquies-vol-i/#inferno-canto-i`,
    }]);
    await page.clock.runFor(2100);
    await expect(button).toHaveAttribute("aria-label", "Share track");
    await expect(button).toHaveAttribute("title", "Share track");
    expect(await button.innerHTML()).toBe(original);
    await expect(button).not.toHaveClass(/is-copied/);
  });
}

test("repeated track sharing restores the original button after the latest feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const button = page.locator('#music-player [data-action="share"]');
  await expect(button).toBeEnabled();
  const original = await button.innerHTML();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Link copied");
  await page.clock.runFor(1000);
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Link copied");
  await page.clock.runFor(1100);
  await expect(button).toHaveAttribute("aria-label", "Link copied");
  await page.clock.runFor(1000);
  await expect(button).toHaveAttribute("aria-label", "Share track");
  await expect(button).toHaveAttribute("title", "Share track");
  expect(await button.innerHTML()).toBe(original);
  await expect(button).not.toHaveClass(/is-copied/);
});

test("pending track sharing shows no success and ignores older completions", async ({ page }) => {
  await page.addInitScript(() => {
    window.copyRequests = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => new Promise((resolve, reject) => {
      window.copyRequests.push({ resolve, reject });
    }) } });
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const button = page.locator('#music-player [data-action="share"]');
  await expect(button).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Share track");
  await button.click();
  await page.evaluate(() => window.copyRequests[1].reject(new DOMException("Copy rejected", "NotAllowedError")));
  await expect(button).toHaveAttribute("aria-label", "Could not copy link");
  await page.evaluate(() => window.copyRequests[0].resolve());
  await expect(button).toHaveAttribute("aria-label", "Could not copy link");
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Share track");
  await page.evaluate(() => window.copyRequests[2].resolve());
  await expect(button).toHaveAttribute("aria-label", "Link copied");
  await button.click();
  await expect(button).toHaveAttribute("aria-label", "Share track");
  await expect(button).not.toHaveClass(/is-copied/);
  await page.evaluate(() => window.copyRequests[3].resolve());
  await expect(button).toHaveAttribute("aria-label", "Link copied");
  await page.clock.runFor(2100);
  await expect(button).toHaveAttribute("aria-label", "Share track");
});
