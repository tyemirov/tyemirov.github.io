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
  test(`homepage keeps its portrait bounded and controls on one row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 998 });
    await page.goto("/");
    await expect(page.locator(".hero-copy h1")).toHaveText("Models, articles, music, and art.");
    const portrait = await page.locator(".profile-photo img").boundingBox();
    expect(portrait.width).toBeLessThanOrEqual(width <= 1000 ? 160 : 340);
    expect(portrait.height / portrait.width).toBeCloseTo(1.5, 1);
    {
      const rows = await page.locator(".hero-links a").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(1);
    }
    expect((await page.locator(".hero").boundingBox()).height).toBeLessThan(1100);
    await page.evaluate(() => document.fonts.ready);
    const sectionGap = await page.evaluate(() => {
      const music = document.querySelector(".music-section").getBoundingClientRect();
      const arts = document.querySelector(".arts-section").getBoundingClientRect();
      return arts.top - music.bottom;
    });
    expect(Math.round(sectionGap)).toBeGreaterThanOrEqual(width <= 600 ? 60 : 100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/homepage-${width}-${test.info().project.name}.png`, fullPage: true });
  });
}

for (const width of [390, 769, 1280]) {
  test(`homepage portrait and navigation persist across reload and return at ${width}px`, async ({ page }) => {
    const nextLinkKey = test.info().project.name === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    for (const visit of ["initial", "reload", "return"]) {
      if (visit === "reload") await page.reload();
      if (visit === "return") {
        await page.locator('.hero-links').getByRole('link', { name: 'Music', exact: true }).click();
        await expect(page.locator(".album-card")).toHaveCount(6);
        await page.goBack({ waitUntil: "commit" });
      }
      await expect(page.locator(".hero-links a")).toHaveCount(5);
      const portrait = page.locator(".profile-photo img");
      await expect.poll(() => portrait.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
      const metrics = await page.evaluate(() => {
        const image = document.querySelector(".profile-photo img");
        const { width, height } = image.getBoundingClientRect();
        return {
          portrait: { width, height, fit: getComputedStyle(image).objectFit },
          rows: [...document.querySelectorAll(".hero-links a")].map(link => Math.round(link.getBoundingClientRect().top)),
          height: document.documentElement.scrollHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(metrics.portrait.width).toBeLessThanOrEqual(width <= 1000 ? 160 : 340);
      expect(metrics.portrait.height / metrics.portrait.width).toBeCloseTo(1.5, 1);
      expect(metrics.portrait.fit).toBe("cover");
      expect(metrics.overflow).toBe(false);
      expect(new Set(metrics.rows).size).toBe(1);
      const links = page.locator(".hero-links a");
      await page.keyboard.press(nextLinkKey);
      await links.first().focus();
      for (let index = 0; index < 5; index++) {
        await expect(links.nth(index)).toBeFocused();
        const focus = await links.nth(index).evaluate(link => {
          const style = getComputedStyle(link);
          return { visible: link.matches(":focus-visible"), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
        });
        expect(focus.visible).toBe(true);
        expect(focus.outline).not.toBe("none");
        expect(focus.width).toBeGreaterThan(0);
        if (index < 4) await page.keyboard.press(nextLinkKey);
      }
      await test.info().attach(`${width}-${visit}-metrics`, { body: JSON.stringify(metrics), contentType: "application/json" });
      await page.screenshot({ path: `output/playwright/homepage-${width}-${visit}-${test.info().project.name}.png`, fullPage: true });
    }
  });
}

test("homepage gallery previews open the existing exhibit and full artwork", async ({ page }) => {
  await page.goto("/");
  const previews = page.locator(".arts-section .arts-preview");
  await expect(previews).toHaveCount(4);
  await expect(previews.first().locator("img")).toBeVisible();
  await previews.first().click();
  await expect(page).toHaveURL(/\/gallery\/exhibits\/the-third-act\/$/);
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
  await page.goto("/gallery/exhibits/the-third-act/");
  await expect(page.locator("#exhibit-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
  await page.reload();
  await expect(page.locator("#exhibit-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
});
