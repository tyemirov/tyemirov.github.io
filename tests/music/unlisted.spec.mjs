// @ts-check
import { readFile } from 'node:fs/promises';
import { test, expect } from './test-fixtures.mjs';

const source = JSON.parse(await readFile('data/site.json', 'utf8'));
const album = source.music.items.find(album => album.status === 'draft' && album.visibility === 'unlisted');
const path = `/music/${album.slug}/`;

test('production excludes the pending album and its playback authorization', async ({ request }) => {
  expect((await request.get(path)).status()).toBe(404);
  const catalog = await (await request.get('/data/site.json')).json();
  expect(catalog.music.items.some(item => item.slug === album.slug)).toBe(false);
  const allowlist = await (await request.get('/music/playback-allowlist.json')).json();
  expect(allowlist.tracks.some(track => album.tracks.some(item => item.id === track.id))).toBe(false);
});

for (const width of [390, 1280]) {
  test(`unlisted preview plays all five songs without discovery links at ${width}px`, async ({ page, context }) => {
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    await context.addCookies([{ name: 'music-fixture', value: 'unlisted', domain: 'localhost', path: '/' }]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: album.title, exact: true })).toBeVisible();
    await expect(page.locator('.track-title')).toHaveText(album.tracks.map(track => track.title));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('.credits-body')).toContainText('Kirill Reshetnikov');
    for (const track of album.tracks) {
      const grant = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/music/playback-grants'));
      await page.locator(`button[data-play-track="${track.id}"]`).click();
      expect((await grant).status()).toBe(201);
      await expect.poll(() => page.locator('#music-player audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(0.2);
      expect(await page.locator('#music-player audio').evaluate(audio => audio.error)).toBeNull();
    }
    await page.getByRole('region', { name: 'Music player' }).getByRole('button', { name: 'Pause', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/unlisted-${width}-${test.info().project.name}.png`, fullPage: true });
    // A direct reload and a track fragment both retain the selected album.
    await page.goto(path + '#' + album.tracks[4].slug);
    await expect(page.locator('.track-row.is-highlighted')).toHaveAttribute('data-track-id', album.tracks[4].id);
    await page.reload();
    await expect(page.locator('.track-row')).toHaveCount(5);
    for (const destination of ['/', '/music/']) {
      await page.goto(destination);
      await expect(page.locator(destination === '/' ? '.music-list .music-card' : '.album-card').first()).toBeVisible();
      await expect(page.locator(`main a[href="${path}"], main button[data-play-album="${album.slug}"]`)).toHaveCount(0);
      expect(await page.locator('main').innerText()).not.toContain(album.title);
    }
    expect(await (await context.request.get('/sitemap.xml')).text()).not.toContain(path);
  });
}
