// @ts-check
import { test, expect } from "./test-fixtures.mjs";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../../data/site.json", import.meta.url), "utf8"));
const paths = ["/", "/civilization/", "/decisioning/", "/freedom/", "/gallery/", "/timeseries/", "/music/", "/articles/",
  ...catalog.music.items.filter(album => album.status === "live").map(album => `/music/${album.slug}/`),
  ...catalog.articles.items.filter(article => article.status === "live").map(article => `/articles/${article.slug}/`)];

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

for (const width of [390, 1280]) {
  for (const path of paths) {
    test(`current footer on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const footer = page.locator("#site-footer");
      await expect(footer).toHaveAttribute("menu", /"placement":"top"/);
      const button = footer.getByRole("button", { name: "Website software by MPR Lab", exact: true });
      await button.click();
      await expect(footer.getByRole("link", { name: "Gravity Notes", exact: true })).toHaveAttribute("href", "https://gravity.mprlab.com");
      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      const layout = await footer.evaluate(element => ({ width: element.clientWidth, contentWidth: element.scrollWidth }));
      expect(layout.contentWidth).toBeLessThanOrEqual(layout.width);
      const declarations = await page.locator('script[src*="/mpr-ui@"],link[href*="/mpr-ui@"]')
        .evaluateAll(elements => elements.map(element => element.getAttribute("src") || element.getAttribute("href")));
      expect(declarations.length).toBeGreaterThan(0);
      expect(declarations.every(url => url.includes("/mpr-ui@latest/"))).toBe(true);
    });
  }
}

test("footer theme control changes the homepage colors", async ({ page }) => {
  await page.goto("/");
  const before = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator("#site-footer").getByRole("button", { name: /theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(before);
  await page.locator("#site-footer").screenshot({ path: `output/playwright/shared-footer-${test.info().project.name}.png` });
});
