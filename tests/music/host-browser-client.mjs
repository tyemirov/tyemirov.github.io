// @ts-check
import { chromium, firefox, webkit, expect } from '@playwright/test';
import { installSharedUIAssets } from './shared-ui-assets.mjs';

const website = 'https://tyemirov.net';
const apiOrigin = 'https://api.tyemirov.net';
const results = [];
for (const [name, engine, options, privacy] of [
  ['chromium', chromium, { args: ['--test-third-party-cookie-phaseout'] }, 'third-party cookie phaseout'],
  ['firefox', firefox, { firefoxUserPrefs: { 'network.cookie.cookieBehavior': 1 } }, 'third-party cookies blocked'],
  ['webkit', webkit, {}, 'default WebKit privacy'],
]) {
  const browser = await engine.launch({ headless: true, ...options });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await installSharedUIAssets(context);
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    await context.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) { this.muted = true; return play.apply(this, args); };
    });
    const page = await context.newPage();
    const media = [];
    page.on('response', response => { if (response.url().includes('/hls/')) media.push({ url: response.url(), status: response.status() }); });
    await page.goto(`${website}/music/soliloquies-vol-i/`);
    await page.locator('.track-play').first().click();
    const player = page.getByRole('region', { name: 'Music player' });
    const audio = player.locator('audio');
    await expect.poll(() => audio.evaluate(element => element.currentTime), { timeout: 15000 }).toBeGreaterThan(1);
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await player.getByLabel('Seek').fill('7');
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(7.2);
    const cookies = await context.cookies(`${apiOrigin}/music`);
    expect(cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: '__Secure-music-session', domain: 'api.tyemirov.net', path: '/music', secure: true, httpOnly: true, sameSite: 'Strict' })]));
    expect(await context.cookies(website)).toEqual([]);
    expect(await context.cookies(`${apiOrigin}/gallery`)).toEqual([]);
    expect(await audio.evaluate(element => element.muted)).toBe(true);
    process.stderr.write(JSON.stringify({browser:name, media:media.map(response=>({file:new URL(response.url).pathname.split('/').at(-1),status:response.status}))}) + '\n');
    expect(media.some(response => response.url.endsWith('index.m3u8') && [200, 206].includes(response.status))).toBe(true);
    expect(media.some(response => response.url.endsWith('seg-00001.m4s') && [200, 206].includes(response.status))).toBe(true);
    expect(media.every(response => new URL(response.url).origin === apiOrigin && [200, 206].includes(response.status))).toBe(true);
    const native = await audio.evaluate(element => element.canPlayType('application/vnd.apple.mpegurl') !== '');
    await page.reload();
    await page.locator('.track-play').first().click();
    await expect.poll(() => page.locator('#music-player audio').evaluate(element => element.currentTime), { timeout: 15000 }).toBeGreaterThan(0.5);
    results.push({ browser: name, version: browser.version(), privacy, engine: native ? 'native HLS' : 'hls.js', playback: true, seeking: true, reload: true, cookie: 'host-only Secure HttpOnly SameSite=Strict Path=/music' });
    await context.close();
  } finally { await browser.close(); }
}
process.stdout.write(JSON.stringify(results) + '\n');
