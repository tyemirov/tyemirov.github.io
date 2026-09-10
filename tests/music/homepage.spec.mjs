// @ts-check
import { test, expect } from "./test-fixtures.mjs";

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com|www\.paypal\.com/, (route) => route.abort());
});

test("Soliloquies Vol. II is featured with its cover and nine recordings", async ({ page }) => {
  await page.goto("/");
  const album = page.locator('.music-list a[href="/music/soliloquies-vol-ii/"]').first();
  await expect(album).toBeVisible();
  await album.click();
  await expect(page.getByRole("heading", { name: "Soliloquies Vol. II", exact: true })).toBeVisible();
  await expect(page.locator(".track-title")).toHaveCount(9);
  await expect(page.getByRole("link", { name: "Suno", exact: true })).toHaveAttribute("href", "https://suno.com/playlist/260e3808-961d-42e7-97d3-222770ae14ac");
  await expect.poll(() => page.locator('img[src="/music/covers/soliloquies-vol-ii.jpg"]').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
});

for (const width of [1280, 769, 390]) {
  test(`homepage uses a compact portrait and spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 998 });
    await page.goto("/");
    await expect(page.locator(".hero-copy h1")).toHaveText("Tools, essays, music, and arts.");
    const portrait = await page.locator(".profile-photo img").boundingBox();
    expect(portrait.width).toBeLessThanOrEqual(120);
    expect(portrait.height).toBeLessThanOrEqual(120);
    if (width >= 769) {
      const rows = await page.locator(".hero-links a").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(1);
    }
    expect((await page.locator(".hero").boundingBox()).height).toBeLessThan(width >= 769 ? 520 : 700);
    const music = await page.locator(".music-section").boundingBox();
    const arts = await page.locator(".arts-section").boundingBox();
    expect(arts.y - music.y - music.height).toBeLessThanOrEqual(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/homepage-${width}-${test.info().project.name}.png`, fullPage: true });
  });
}

test("homepage gallery previews open the existing exhibit and full artwork", async ({ page }) => {
  await page.goto("/");
  const previews = page.locator(".arts-section .arts-preview");
  await expect(previews).toHaveCount(4);
  await expect(previews.first().locator("img")).toBeVisible();
  await previews.first().click();
  await expect(page).toHaveURL(/\/gallery\/#\/exhibits\/the-third-act$/);
  await expect(page.locator("#exhibit-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
  await expect(page.locator("mpr-header")).toHaveAttribute("brand-href", "/");
  await expect(page.locator(".artwork-grid .artwork-card")).toHaveCount(4);
  await page.locator("[data-media]").first().click();
  const lightbox = page.getByRole("dialog");
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator("img")).toHaveAttribute("alt", "Triptych No.1");
  await expect.poll(() => lightbox.locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await page.getByRole("link", { name: "Back to exhibits" }).click();
  await expect(page.locator("#home-view")).toBeVisible();
  await expect(page.locator("#exhibit-view")).toBeHidden();
});

test("gallery direct routes show one view after reload", async ({ page }) => {
  await page.goto("/gallery/#/exhibits/the-third-act");
  await expect(page.locator("#exhibit-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
  await page.reload();
  await expect(page.locator("#exhibit-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
});
