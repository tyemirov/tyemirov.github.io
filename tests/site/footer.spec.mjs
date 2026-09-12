// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

for (const width of [390, 1280]) {
  test(`footer follows content and fills short pages at ${width}px`, async ({ page }) => {
    const routes = await (await page.request.get('/data/routes.json')).json();
    for (const path of [...routes.map(route => route.path), '/404.html', '/?topic=Writings']) {
      await test.step(path, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator('#site-footer')).toHaveAttribute('menu', /"placement":"top"/);
        const footer = page.locator('#site-footer footer');
        await expect(footer).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const height of [900, 4000]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          const metrics = await page.evaluate(() => {
            const footer = document.querySelector('#site-footer footer');
            const content = document.querySelector('body > main, body > .page-shell, body > .container');
            return {
              footerTop: footer.getBoundingClientRect().top,
              footerBottom: footer.getBoundingClientRect().bottom,
              contentBottom: content.getBoundingClientRect().bottom,
              pageHeight: document.documentElement.scrollHeight,
              position: getComputedStyle(footer).position,
            };
          });
          expect.soft(metrics.footerBottom, `${path} at ${height}px: viewport bottom`).toBeGreaterThanOrEqual(height - 1);
          expect.soft(Math.abs(metrics.footerBottom - metrics.pageHeight), `${path} at ${height}px: document bottom`).toBeLessThanOrEqual(1);
          expect.soft(metrics.footerTop, `${path}: content overlap`).toBeGreaterThanOrEqual(metrics.contentBottom - 1);
          expect.soft(['fixed', 'sticky'], `${path}: footer stays in document flow`).not.toContain(metrics.position);
          if (path === '/gallery/studio/' && height === 900) {
            await page.screenshot({ path: `output/playwright/footer/studio-${width}-${test.info().project.name}.png`, fullPage: true });
          }
        }
      });
    }
  });
}
