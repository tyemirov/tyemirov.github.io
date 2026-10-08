// @ts-check
import { test, expect } from './test-fixtures.mjs';

const albumTitle = 'Soliloquies Vol. I';
const surfaces = [
  { name: 'homepage', path: '/', cover: '.music-card-cover' },
  { name: 'Music grid', path: '/music/', cover: '.album-cover' },
  { name: 'album page', path: '/music/soliloquies-vol-i/', cover: '.album-cover-large' },
];

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
});

for (const width of [390, 1280]) {
  for (const surface of surfaces) {
    test(`${surface.name} has the same centered album control at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(surface.path);
      const button = page.getByRole('button', { name: `Play ${albumTitle}`, exact: true });
      await expect(button).toBeEnabled();
      const geometry = await button.evaluate((control, selector) => {
        const cover = control.parentElement.querySelector(selector).getBoundingClientRect();
        const bounds = control.getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2 - cover.x - cover.width / 2,
          y: bounds.y + bounds.height / 2 - cover.y - cover.height / 2, width: bounds.width,
          nestedInLink: !!control.closest('a') };
      }, surface.cover);
      expect(Math.abs(geometry.x)).toBeLessThan(1);
      expect(Math.abs(geometry.y)).toBeLessThan(1);
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.nestedInLink).toBe(false);
      await button.focus();
      await page.keyboard.press('Enter');
      const audio = page.locator('#music-player audio');
      await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.2);
      await expect(page.locator('.player-track')).toHaveText('Inferno — Canto I');
      expect(new URL(page.url()).pathname).toBe(surface.path);
      await page.getByRole('button', { name: `Pause ${albumTitle}`, exact: true }).click();
      await expect(audio).toHaveJSProperty('paused', true);
      await button.locator('..').screenshot({ path: `output/playwright/album-control-${surface.name.replaceAll(' ', '-')}-${width}-${test.info().project.name}.png` });
      await page.getByRole('button', { name: `Play ${albumTitle}`, exact: true }).click();
      await expect(audio).toHaveJSProperty('paused', false);
    });
  }
  test(`all three surfaces preserve the current track and paused position at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: `Play ${albumTitle}`, exact: true }).click();
    const audio = page.locator('#music-player audio');
    await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.2);
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect(page.locator('.player-track')).toHaveText('To be, or not to be (Hamlet)');
    await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.2);
    await page.getByRole('button', { name: `Pause ${albumTitle}`, exact: true }).click();
    await audio.evaluate(node => { globalThis.coverAudio = node; });
    const position = await audio.evaluate(node => node.currentTime);
    await page.locator('#music .section-actions a').click();
    await expect(page.getByRole('button', { name: `Play ${albumTitle}`, exact: true })).toBeEnabled();
    await page.locator('.album-title a[href$="/music/soliloquies-vol-i/"]').click();
    await expect(page.locator('.album-title-large')).toHaveText(albumTitle);
    await expect(page.getByRole('button', { name: `Play ${albumTitle}`, exact: true })).toBeEnabled();
    expect(await audio.evaluate(node => node === globalThis.coverAudio)).toBe(true);
    await expect(audio).toHaveJSProperty('paused', true);
    expect(await audio.evaluate(node => node.currentTime)).toBeCloseTo(position, 1);
    await page.getByRole('button', { name: `Play ${albumTitle}`, exact: true }).click();
    await expect(page.locator('.player-track')).toHaveText('To be, or not to be (Hamlet)');
    await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(position);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('button', { name: `Pause ${albumTitle}`, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: `Pause ${albumTitle}`, exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', true);
    await expect(page.locator('#music-player audio')).toHaveCount(1);
  });
}

test('homepage keeps album navigation when player configuration fails', async ({ page, context }) => {
  await context.route('**/config-site.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.locator('.music-section [role="alert"]')).toContainText('Player is unavailable');
  await expect(page.locator('.music-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: `Play ${albumTitle}`, exact: true })).toBeDisabled();
  await page.locator('.music-card-details').filter({ has: page.getByRole('heading', { name: albumTitle, exact: true }) }).click();
  await expect(page.locator('.album-title-large')).toHaveText(albumTitle);
});

test('a homepage album with external tracks retains navigation without a play control', async ({ page, context }) => {
  await context.route('**/data/site.json', async route => {
    const site = await (await route.fetch()).json();
    site.music.items.find(album => album.slug === 'soliloquies-vol-i').tracks.forEach(track => { track.playback = { kind: 'external' }; });
    await route.fulfill({ json: site });
  });
  await page.goto('/');
  const card = page.locator('.music-card').filter({ has: page.getByRole('heading', { name: albumTitle, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await card.locator('.music-card-details').click();
  await expect(page.locator('.album-title-large')).toHaveText(albumTitle);
  await expect(page.locator('.album-play')).toHaveCount(0);
});
