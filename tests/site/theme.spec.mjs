// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('../../data/site.json', import.meta.url), 'utf8'));
const paths = ['/', '/music/', '/articles/', '/gallery/', '/gallery/about/', '/gallery/cart/', '/gallery/order/', '/gallery/studio/',
  ...site.projects.filter(project => project.kind === 'model').map(project => project.href),
  ...site.music.items.filter(album => album.status === 'live').map(album => `/music/${album.slug}/`),
  ...site.articles.items.filter(article => article.status === 'live').map(article => `/articles/${article.slug}/`),
  ...['artworks', 'collections', 'exhibits'].flatMap(kind => site.gallery[kind].map(item => `/gallery/${kind}/${item.id}/`)),
  '/school-atlas/admissions-audit.html', '/school-atlas/private-coverage.html', '/404.html'];

function luminance(color) {
  const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground, background) {
  const foregroundChannels = foreground.match(/[\d.]+/g).map(Number);
  const backgroundChannels = background.match(/[\d.]+/g).map(Number);
  const alpha = foregroundChannels[3] ?? 1;
  const composite = foregroundChannels.slice(0, 3).map((value, index) => value * alpha + backgroundChannels[index] * (1 - alpha));
  const values = [luminance(`rgb(${composite.join(', ')})`), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const width of [390, 1440]) {
  for (const path of paths) {
    test(`one header theme control and two palettes on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const control = page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ });
      await expect(control).toBeVisible();
      await expect(page.getByRole('button', { name: /Toggle theme/ })).toHaveCount(1);
      const box = await control.boundingBox();
      expect(box.y).toBeLessThan(180);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const light = await page.locator('body').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
      expect(contrast(light.color, light.background)).toBeGreaterThanOrEqual(4.5);
      await control.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).color)).not.toBe(light.color);
      await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(light.background);
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
      const dark = await page.locator('body').evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
      expect(contrast(dark.color, dark.background)).toBeGreaterThanOrEqual(4.5);
      expect(luminance(light.background)).toBeGreaterThan(luminance(dark.background));
      if (width === 1440 && ['/', '/gallery/', '/school-atlas/', '/civilization/', '/decisioning/', '/freedom/', '/timeseries/'].includes(path)) {
        await page.screenshot({ path: `output/playwright/theme/${path.split('/').filter(Boolean).join('-') || 'home'}-dark-${test.info().project.name}.png`, animations: 'disabled' });
      }
      await control.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('body')).toHaveCSS('color', light.color);
      await expect(page.locator('body')).toHaveCSS('background-color', light.background);
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
      if (width === 1440 && ['/', '/gallery/', '/school-atlas/', '/civilization/', '/decisioning/', '/freedom/', '/timeseries/'].includes(path)) {
        await page.screenshot({ path: `output/playwright/theme/${path.split('/').filter(Boolean).join('-') || 'home'}-light-${test.info().project.name}.png`, animations: 'disabled' });
      }
    });
  }
}

test('theme preference survives navigation, history, reload, and another tab', async ({ page, context }) => {
  await page.goto('/music/');
  const control = () => page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ });
  await control().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('https://localhost:18443/');
  await expect(page.getByRole('heading', { name: 'Tools, essays, music, and arts.', exact: true })).toBeFocused();
  await expect(control()).toBeVisible();
  await page.getByRole('link', { name: 'Enter Gallery', exact: false }).click();
  await expect(page).toHaveURL(/\/gallery\/$/);
  await expect(page.getByRole('heading', { name: 'Virtual Gallery', exact: true })).toBeFocused();
  await expect(control()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(control()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goBack();
  await expect(page).toHaveURL('https://localhost:18443/');
  await expect(page.getByRole('heading', { name: 'Tools, essays, music, and arts.', exact: true })).toBeFocused();
  await expect(control()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const other = await context.newPage();
  await other.goto('/school-atlas/');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goForward();
  await expect(page).toHaveURL(/\/gallery\/$/);
  await expect(page.getByRole('heading', { name: 'Virtual Gallery', exact: true })).toBeFocused();
  await expect(control()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await control().click({ trial: true });
  await control().focus();
  await expect(control()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.close();
});

test('theme switch remains available after shared authentication header updates', async ({ page, context }) => {
  await context.addCookies([{ name: 'gallery-fixture', value: 'checkout', domain: 'localhost', path: '/', secure: true }]);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/gallery/studio/');
  const control = page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ });
  await control.click();
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  await expect(page.locator('#studio-workspace')).toBeVisible();
  await expect(control).toHaveCount(1);
  await expect(control).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const box = await control.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await control.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('active charts and form controls change palettes without resetting their data', async ({ page }) => {
  for (const [path, selector, property] of [
    ['/school-atlas/', '.school-point', 'fill'],
    ['/civilization/', '#constraintsBarSvg text', 'fill'],
    ['/decisioning/', '#accuracyStakesArea svg text', 'fill'],
    ['/freedom/', '#scatterChart .xtick text', 'fill'],
  ]) {
    await page.goto(path);
    if (path === '/civilization/') await page.getByRole('tab', { name: 'Visuals', exact: true }).click();
    if (path === '/decisioning/') await page.getByRole('button', { name: 'Load example', exact: true }).click();
    const sample = page.locator(selector).first();
    await expect(sample).toBeAttached();
    const before = await sample.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property);
    const count = await page.locator(selector).count();
    await page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
    await expect.poll(() => sample.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property)).not.toBe(before);
    await expect(page.locator(selector)).toHaveCount(count);
    await page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
  }
});

test('persistent music player follows the current theme on tool pages', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  const player = page.getByRole('region', { name: 'Music player' });
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Time Series and Thresholds', exact: true }).click();
  await expect(player).toBeVisible();
  const before = await player.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
  await expect.poll(() => player.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(before);
  await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('model choices and companion links remain readable in both palettes', async ({ page }) => {
  for (const path of ['/freedom/', '/civilization/']) {
    await page.goto(path);
    for (const mode of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== mode) {
        await page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      const sample = path === '/freedom/' ? page.locator('#selectionList') : page.locator('.btn-outline-info');
      const readContrast = async () => sample.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
        let background = 'rgba(0, 0, 0, 0)';
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          background = getComputedStyle(ancestor).backgroundColor;
          if (background !== 'rgba(0, 0, 0, 0)') break;
        }
        return { text: getComputedStyle(element).color, background };
      });
      const colors = await readContrast();
      expect(contrast(colors.text, colors.background), JSON.stringify({ path, mode, ...colors })).toBeGreaterThanOrEqual(4.5);
      if (path === '/civilization/') {
        await sample.hover();
        const hover = await readContrast();
        expect(contrast(hover.text, hover.background)).toBeGreaterThanOrEqual(4.5);
        await page.locator('mpr-header').hover();
      } else {
        await page.locator('summary').filter({ hasText: 'Methodology & Sources' }).click();
        const model = page.locator('.mono.small[style*="color:var(--text)"]');
        await expect(model).toBeVisible();
        await expect(model).toHaveCSS('color', await page.locator('body').evaluate(element => getComputedStyle(element).color));
        await page.locator('summary').filter({ hasText: 'Methodology & Sources' }).click();
      }
    }
  }
});

test('headless WebGL scene and canvas labels follow the theme', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium verifies the WebGL pixels and canvas labels.');
  await page.addInitScript(() => {
    globalThis.themeCanvasText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      globalThis.themeCanvasText.push({ text: args[0], fill: this.fillStyle });
      return fillText.apply(this, args);
    };
  });
  await page.goto('/decisioning/');
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  const canvas = page.locator('#threeDimensionHost canvas');
  await expect(canvas).toBeVisible();
  const canvasHandle = await canvas.elementHandle();
  const corner = () => canvas.evaluate(element => new Promise(resolve => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    requestAnimationFrame(() => {
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      resolve(`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
    });
  }));
  const light = await corner();
  const expectedCorner = () => page.evaluate(() => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim().slice(1);
    const channels = hex.match(/../g).map(channel => parseInt(channel, 16));
    return `rgb(${channels.join(', ')})`;
  });
  expect(light).toBe(await expectedCorner());
  await canvas.screenshot({ path: 'output/playwright/theme/decisioning-webgl-light-chromium.png' });
  const label = () => page.evaluate(() => globalThis.themeCanvasText.filter(item => item.text === 'X: Expected Value').at(-1).fill);
  const lightLabel = await label();
  await page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ }).click();
  await expect.poll(async () => luminance(await corner())).toBeLessThan(luminance(light));
  await expect.poll(corner).toBe(await expectedCorner());
  await expect.poll(label).not.toBe(lightLabel);
  expect(await canvasHandle.evaluate(element => element.isConnected)).toBe(true);
  await canvas.screenshot({ path: 'output/playwright/theme/decisioning-webgl-dark-chromium.png' });
});

test('theme storage failure is visible and a later switch saves the preference', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    let rejected = false;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tyemirov:theme' && !rejected) {
        rejected = true;
        throw new DOMException('Fixture quota', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/');
  const control = page.locator('mpr-header').getByRole('button', { name: /Toggle theme/ });
  await control.click();
  await expect(page.getByRole('alert')).toHaveText('Could not save the theme. Try the switch again.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await control.click();
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
