// @ts-check
import { test, expect } from './test-fixtures.mjs';
import { routes } from '../../assets/js/generated/routes.js';

for (const width of [390, 1280]) {
  test(`album covers start and control playback without navigation at ${width}px`, async ({ page, context }) => {
    await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/music/');
    const card = page.locator('.album-card').filter({ has: page.getByRole('heading', { name: 'Soliloquies Vol. I', exact: true }) });
    const button = card.getByRole('button', { name: 'Play Soliloquies Vol. I', exact: true });
    await expect(button).toBeEnabled();
    const geometry = await button.evaluate(control => {
      const cover = control.parentElement.querySelector('.album-cover').getBoundingClientRect();
      const bounds = control.getBoundingClientRect();
      return { x: bounds.x + bounds.width / 2 - cover.x - cover.width / 2,
        y: bounds.y + bounds.height / 2 - cover.y - cover.height / 2, width: bounds.width };
    });
    expect(Math.abs(geometry.x)).toBeLessThan(1);
    expect(Math.abs(geometry.y)).toBeLessThan(1);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    await button.focus();
    await page.keyboard.press('Enter');
    const audio = page.locator('#music-player audio');
    await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.3);
    await expect(page).toHaveURL(/\/music\/$/);
    await expect(page.locator('.player-album')).toHaveText('Soliloquies Vol. I');
    await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
    await card.getByRole('button', { name: 'Pause Soliloquies Vol. I', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', true);
    await card.getByRole('button', { name: 'Play Soliloquies Vol. I', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', false);
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect(page.locator('.player-track')).toHaveText('To be, or not to be (Hamlet)');
    const second = page.getByRole('button', { name: 'Play Soliloquies Vol. II', exact: true });
    await second.click();
    await expect(page.locator('.player-album')).toHaveText('Soliloquies Vol. II');
    await expect(audio).toHaveJSProperty('paused', false);
    await expect(page.locator('#music-player audio')).toHaveCount(1);
    await expect(page).toHaveURL(/\/music\/$/);
    await page.locator('#album-grid').screenshot({ path: `output/playwright/album-play-${width}-${test.info().project.name}.png` });
    await card.locator('.album-title a').click();
    await expect(page).toHaveURL(/soliloquies-vol-i\/$/);
    await expect(page.locator('.player-album')).toHaveText('Soliloquies Vol. II');
    await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Music', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause Soliloquies Vol. II', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Pause Soliloquies Vol. II', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', true);
  });
}

test('every published album has a cover control and plays its bundled recording', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'recordings', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  await page.setViewportSize({ width: 1345, height: 900 });
  await page.goto('/music/');
  const catalog = await (await page.request.get('/data/site.json')).json();
  const albums = catalog.music.items;
  await expect(page.locator('.album-play')).toHaveCount(albums.length);
  for (const album of albums) {
    await expect(page.getByRole('button', { name: `Play ${album.displayTitle ?? album.title}`, exact: true })).toBeEnabled();
  }
  await page.locator('.album-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `output/playwright/album-grid-play-${test.info().project.name}.png` });
  for (const album of albums) {
    await page.getByRole('button', { name: `Play ${album.displayTitle ?? album.title}`, exact: true }).click();
    await expect(page.locator('.player-album')).toHaveText(album.displayTitle ?? album.title);
    await expect(page.locator('.player-track')).toHaveText(album.tracks.find(track => track.playback.kind === 'file').title);
    await expect.poll(() => page.locator('#music-player audio').evaluate(node => node.currentTime)).toBeGreaterThan(.1);
    await expect(page).toHaveURL(/\/music\/$/);
    await page.getByRole('button', { name: `Pause ${album.displayTitle ?? album.title}`, exact: true }).click();
  }
});

test('a second center click stays on the grid while playback is loading', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await context.route(url => url.pathname === routes.music.createGrant.path, async route => { await pending; await route.continue(); });
  await page.goto('/music/');
  const button = page.getByRole('button', { name: 'Play Soliloquies Vol. I', exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  const navigationRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/music/soliloquies-vol-i/') navigationRequests.push(request.url()); });
  await button.scrollIntoViewIfNeeded();
  const bounds = await button.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  expect(new URL(page.url()).pathname).toBe('/music/');
  await expect(button).toBeVisible();
  release();
  await expect.poll(() => page.locator('#music-player audio').evaluate(node => node.currentTime)).toBeGreaterThan(.1);
  await expect(page).toHaveURL(/\/music\/$/);
  expect(navigationRequests).toEqual([]);
});
