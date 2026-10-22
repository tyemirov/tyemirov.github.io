// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';
import { installBrowserAssets, isBrowserDependency } from '../music/browser-assets.mjs';
import { installGoogleSignIn } from '../music/google-sign-in.mjs';

const googleSDK = url => url.hostname === 'accounts.google.com' && url.pathname.startsWith('/gsi/');

test('shared UI, fonts, and sign-in load without upstream browser requests', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const upstreamRequests = [];
  const dependencyRequests = [];
  try {
    // Uncaptured versions must fail instead of depending on provider availability.
    await context.route(url => isBrowserDependency(url) || googleSDK(url), async route => {
      upstreamRequests.push(route.request().url());
      await route.abort('failed');
    });
    await installBrowserAssets(context);
    await installGoogleSignIn(context);
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    const page = await context.newPage();
    page.on('request', request => {
      const url = new URL(request.url());
      if (isBrowserDependency(url) || googleSDK(url)) dependencyRequests.push(url.href);
    });
    await page.goto('/gallery/');
    await expect(page.getByRole('link', { name: 'The Third Act', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible();
    expect(await page.evaluate(() => globalThis.jsyaml.load('base: &base\n  ready: true\ncopy: *base'))).toEqual({
      base: { ready: true }, copy: { ready: true },
    });
    for (const [pathname, family] of [['/gallery/', 'EB Garamond'], ['/', 'Instrument Serif'], ['/civilization/', 'Space Grotesk']]) {
      if (new URL(page.url()).pathname !== pathname) await page.goto(pathname);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(name => [...document.fonts].some(font => font.family.includes(name) && font.status === 'loaded'), family)).toBe(true);
    }
    expect(dependencyRequests.some(url => url.includes('/mpr-ui@latest/mpr-ui.js'))).toBe(true);
    expect(dependencyRequests.some(url => url.includes('/js-yaml@5.4.1/'))).toBe(true);
    expect(dependencyRequests.some(url => googleSDK(new URL(url)))).toBe(true);
    expect(dependencyRequests.some(url => new URL(url).hostname === 'fonts.gstatic.com')).toBe(true);
    expect(upstreamRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
