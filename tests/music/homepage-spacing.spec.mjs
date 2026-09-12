// @ts-check
import { readFile } from "node:fs/promises";
import { test, expect } from "./test-fixtures.mjs";
import { installCapabilityScenario } from "./browser-capabilities.mjs";

const catalog = JSON.parse(await readFile(new URL("../../data/site.json", import.meta.url), "utf8"));
const pageHeightLimits = new Map([[390, 3800], [769, 2700], [1280, 2350]]);

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

for (const width of [390, 769, 1280]) {
  test(`homepage keeps its complete content compact at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".arts-preview")).toHaveCount(4);
    await expect(page.locator("mpr-footer footer")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("main > section:not(.is-hidden)")];
      const footer = document.querySelector("mpr-footer footer");
      const bounds = footer.getBoundingClientRect();
      return {
        width: innerWidth, height: document.documentElement.scrollHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        gaps: sections.slice(1).map((section, index) => section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom),
        footer: { top: bounds.top + scrollY, bottom: bounds.bottom + scrollY, position: getComputedStyle(footer).position },
        lastActionBottom: document.querySelector(".arts-section .section-actions").getBoundingClientRect().bottom + scrollY,
        bodyFontSize: parseFloat(getComputedStyle(document.querySelector(".card-body")).fontSize),
      };
    });
    await testInfo.attach("page-spacing", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    await page.screenshot({ path: `output/playwright/homepage-gallery-progress/i005-home-${width}-${testInfo.project.name}.png`, fullPage: true });
    expect.soft(metrics.height).toBeLessThan(pageHeightLimits.get(width));
    expect.soft(metrics.overflow).toBe(false);
    expect.soft(Math.round(Math.max(...metrics.gaps))).toBeLessThanOrEqual(32);
    expect.soft(metrics.footer.top - metrics.lastActionBottom).toBeGreaterThanOrEqual(0);
    expect.soft(metrics.footer.top - metrics.lastActionBottom).toBeLessThanOrEqual(48);
    expect.soft(metrics.footer.bottom).toBeCloseTo(metrics.height, 0);
    expect.soft(metrics.bodyFontSize).toBeGreaterThanOrEqual(16);
    await expect(page.locator(".essay-list h2")).toHaveText(catalog.articles.items.filter(item => item.status === "live").sort((a, b) => a.order - b.order).map(item => item.title));
    await expect(page.locator(".hero-links a")).toHaveCount(5);
    for (const action of await page.locator(".hero-links a, .section-actions a").all()) {
      await expect(action).toBeVisible();
      expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(40);
    }
    await page.locator(".arts-section .section-actions a").focus();
    await expect(page.locator(".arts-section .section-actions a")).toBeFocused();
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(page.locator("mpr-footer footer")).toBeInViewport();
    await page.getByRole("navigation", { name: "Filter content" }).getByRole("button", { name: "Modeling", exact: true }).click();
    await expect(page.locator(".project-section")).toBeVisible();
    await expect(page.locator(".essay-section")).toBeHidden();
    await page.getByRole("navigation", { name: "Filter content" }).getByRole("button", { name: "All", exact: true }).click();
    await expect(page.locator(".essay-list .project-card")).toHaveCount(4);
    const footer = page.locator("mpr-footer");
    await footer.getByRole("button", { name: "Website software by MPR Lab", exact: true }).click();
    const contact = footer.getByRole("link", { name: catalog.contact.label, exact: true });
    await contact.scrollIntoViewIfNeeded();
    await expect(contact).toBeInViewport();
    await expect(contact).toHaveAttribute("href", catalog.contact.href);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`shared spacing keeps the real bottom player and footer accessible at ${width}px`, async ({ page, context }, testInfo) => {
    await installCapabilityScenario(context, testInfo);
    await context.addCookies([{ name: "music-fixture", value: "player", domain: "localhost", path: "/" }]);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/music/soliloquies-vol-i/");
    const player = page.getByRole("region", { name: "Music player" });
    await expect(player).toBeHidden();
    await page.evaluate(() => document.fonts.ready);
    const hiddenHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: `output/playwright/homepage-gallery-progress/i005-player-hidden-${width}-${testInfo.project.name}.png`, fullPage: true });
    await page.locator(".track-play").first().click();
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(async () => Math.abs(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)) - (await player.boundingBox()).height)).toBeLessThanOrEqual(1);
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate(fraction => scrollTo({ top: document.documentElement.scrollHeight * fraction, behavior: "instant" }), fraction);
      await expect.poll(async () => { const box = await player.boundingBox(); return Math.abs(box.y + box.height - 844); }).toBeLessThanOrEqual(1);
    }
    const playerBox = await player.boundingBox();
    const footerBox = await page.locator("mpr-footer footer").boundingBox();
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(playerBox.y + 1);
    const visibleHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.abs(visibleHeight - hiddenHeight - playerBox.height)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await testInfo.attach("player-spacing", { body: JSON.stringify({ width, hiddenHeight, visibleHeight, player: playerBox, footer: footerBox }), contentType: "application/json" });
    await page.screenshot({ path: `output/playwright/homepage-gallery-progress/i005-player-visible-${width}-${testInfo.project.name}.png`, fullPage: true });
  });
}
