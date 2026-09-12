// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

test('homepage restores production typography, section hierarchy, and card actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.essay-list article')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  const styles = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      heading: css('.hero h1').fontSize,
      title: css('.essay-list h2').fontSize,
      padding: css('.essay-list article').paddingLeft,
      section: css('.essay-section .section-title').fontSize,
      serif: css('.essay-list h2').fontFamily,
      body: css('.card-body').fontFamily,
      mono: css('.notes-label').fontFamily,
    };
  });
  expect.soft(styles.heading).toBe('128px');
  expect.soft(styles.title).toBe('48px');
  expect.soft(styles.padding).toBe('48px');
  expect.soft(styles.section).toBe('56px');
  expect.soft(styles.serif).toContain('Instrument Serif');
  expect.soft(styles.body).toContain('Space Grotesk');
  expect.soft(styles.mono).toContain('IBM Plex Mono');
  await expect(page.locator('main > section .notes-label:visible')).toHaveCount(4);
  const actions = page.locator('.essay-list .project-actions');
  await expect(actions).toHaveCount(4);
  const firstRow = await actions.evaluateAll(nodes => nodes.slice(0, 3).map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(firstRow).size).toBe(1);
  await page.locator('.arts-preview img').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.arts-preview img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('.hero').screenshot({ path: `output/playwright/restoration/hero-1440-${test.info().project.name}.png` });
  await page.screenshot({ path: `output/playwright/restoration/home-1440-${test.info().project.name}.png`, fullPage: true });
  await page.locator('.essay-list').screenshot({ path: `output/playwright/restoration/essays-${test.info().project.name}.png` });
  await actions.first().getByRole('link', { name: 'Read article', exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/the-human-act-of-making-things-exist\/$/);
  await expect(page.getByRole('link', { name: 'Read the original on Substack' })).toBeVisible();
});

test('resizing preserves a bounded rectangular portrait and one reachable navigation row', async ({ page }) => {
  await page.goto('/');
  await page.locator('.arts-preview img').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.arts-preview img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  for (const width of [1440, 1001, 1000, 769, 600, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const portrait = await page.locator('.profile-photo img').boundingBox();
    expect(portrait.width).toBeLessThanOrEqual(width <= 1000 ? 160 : 340);
    expect(portrait.height / portrait.width).toBeCloseTo(1.5, 1);
    await expect(page.locator('.profile-photo img')).toHaveCSS('border-radius', '0px');
    const links = page.locator('.hero-links a');
    expect(new Set(await links.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)))).size).toBe(1);
    await links.first().focus();
    await links.last().focus();
    await expect(links.last()).toBeInViewport();
    if (width >= 769) {
      expect(await page.locator('.hero-links').evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.hero').screenshot({ path: `output/playwright/restoration/hero-${width}-${test.info().project.name}.png` });
    await page.screenshot({ path: `output/playwright/restoration/home-${width}-${test.info().project.name}.png`, fullPage: true });
  }
});

test('music and generated articles share the restored editorial typography', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, selector] of [['/music/', '.header-copy h1'], ['/music/soliloquies-vol-i/', '.album-title-large'], ['/articles/', '.article-shell h1']]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(selector)).toHaveCSS('font-family', /^"?Instrument Serif"?, serif$/);
    expect(await page.evaluate(() => document.fonts.check('16px "Instrument Serif"') && [...document.fonts].some(font => font.family.includes('Instrument Serif') && font.status === 'loaded'))).toBe(true);
    expect(await page.locator(selector).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(64);
    await page.screenshot({ path: `output/playwright/restoration/${path.split('/').filter(Boolean).join('-')}-${test.info().project.name}.png`, fullPage: true });
  }
});
