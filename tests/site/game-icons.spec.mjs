// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test('game icons load in grayscale and reveal color on hover', async ({ page }) => {
  await page.goto('/#tools');
  const cards = page.locator('.game-card');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const icon = card.locator('.game-icon');
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(icon).toHaveCSS('filter', 'grayscale(1) contrast(1.05) brightness(0.95)');
    await icon.hover();
    await expect(icon).toHaveCSS('filter', 'grayscale(0) contrast(1) brightness(1)');
    await page.mouse.move(0, 0);
    await expect(icon).toHaveCSS('filter', 'grayscale(1) contrast(1.05) brightness(0.95)');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const width of [390, 1280]) {
  test(`game icons sit beside the card content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#tools');
    await expect(page.locator('.game-icon')).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    for (const card of await page.locator('.game-card').all()) {
      const icon = await card.locator('.game-icon').boundingBox();
      const heading = await card.locator('h2').boundingBox();
      const summary = await card.locator('.card-body').boundingBox();
      expect(icon.width).toBeLessThanOrEqual(48);
      expect(icon.x + icon.width).toBeLessThan(heading.x);
      expect(Math.abs(icon.y - heading.y)).toBeLessThanOrEqual(1);
      expect(summary.x).toBe(heading.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
