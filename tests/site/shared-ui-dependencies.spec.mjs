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

// Register the sentinel before the shared browser-assets fixture. Its newer
// tracking route must consume the request before this provider fallback runs.
const trackingEscapes = new WeakMap();
const trackingTest = test.extend({
  context: async ({ context }, use) => {
    const escapes = [];
    trackingEscapes.set(context, escapes);
    await context.route(url => url.origin === 'https://loopaware.mprlab.com', route => {
      escapes.push(route.request().url());
      return route.fulfill({ contentType: 'text/javascript', body: '/* offline provider sentinel */' });
    });
    await use(context);
  },
});

trackingTest('shared browser fixture isolates analytics while preserving the site pixel', async ({ page, context }) => {
  const attempted = [];
  const failed = [];
  const isTracking = request => new URL(request.url()).origin === 'https://loopaware.mprlab.com';
  page.on('request', request => { if (isTracking(request)) attempted.push(request.url()); });
  page.on('requestfailed', request => { if (isTracking(request)) failed.push(request.url()); });
  await page.goto('/#tools');
  await expect(page.getByRole('region', { name: 'Tools', exact: true }).locator('.project-card')).toHaveCount(4);
  const pixel = page.locator('script[src^="https://loopaware.mprlab.com/pixel.js"]');
  await expect(pixel).toHaveAttribute('src', /site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b/);
  expect(attempted).toHaveLength(1);
  expect(failed).toEqual(attempted);
  expect(trackingEscapes.get(context)).toEqual([]);
});

test('model charts load captured Bootstrap and D3 without upstream requests', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const escaped = [];
  const libraries = url => url.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(?:bootstrap|d3)@/.test(url.pathname);
  try {
    await context.route(libraries, route => {
      escaped.push(route.request().url());
      return route.abort('failed');
    });
    await installBrowserAssets(context);
    await context.route(url => url.origin === 'https://loopaware.mprlab.com', route => route.abort());
    const page = await context.newPage();
    await page.goto('/civilization/');
    expect(await page.evaluate(() => ({ d3: globalThis.d3?.version, bootstrap: globalThis.bootstrap?.Collapse.VERSION }))).toEqual({ d3: '7.9.0', bootstrap: '5.3.3' });
    await expect(page.locator('#constraintsBarSvg rect').first()).toBeAttached();
    expect(await page.evaluate(() => [...document.styleSheets].some(sheet => sheet.href?.includes('bootstrap@5.3.3') && sheet.cssRules.length > 100))).toBe(true);
    await page.goto('/decisioning/');
    expect(await page.evaluate(() => globalThis.d3.version)).toBe('7.9.0');
    await expect(page.locator('#accuracyStakesArea svg')).toBeAttached();
    expect(escaped).toEqual([]);
  } finally {
    await context.close();
  }
});
