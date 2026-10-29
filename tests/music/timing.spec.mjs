// @ts-check
import { test, expect } from './test-fixtures.mjs';

test('playback reports bounded start and resume timings without listener identifiers', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  const reports = [];
  await context.route('**/music/playback-observations', async route => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.goto('/music/soliloquies-vol-i/');
  await expect(page.locator('link[rel="preconnect"][crossorigin="use-credentials"]')).toHaveAttribute('href', 'https://localhost:18444');
  await page.locator('.track-play').first().click();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ action: 'start', outcome: 'playing' });
  expect(Object.keys(reports[0]).sort()).toEqual(['action','browser','elapsedMs','grantMs','outcome','readyMs','trackId','timeZone'].sort());
  for (const key of ['elapsedMs','grantMs','readyMs']) {
    expect(reports[0][key]).toBeGreaterThanOrEqual(0);
    expect(reports[0][key]).toBeLessThanOrEqual(300000);
  }
  expect(reports[0].elapsedMs).toBeGreaterThanOrEqual(reports[0].readyMs);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => reports.length).toBe(2);
  expect(reports[1]).toMatchObject({ action: 'resume', outcome: 'playing', readyMs: null });
  await page.waitForTimeout(200);
  expect(reports).toHaveLength(2);
});

test('observation delivery failures do not interrupt playback', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  let attempts = 0;
  await context.route('**/music/playback-observations', route => { attempts++; return route.abort(); });
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  await expect.poll(() => attempts).toBe(1);
  await expect.poll(() => page.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(.5);
  await expect(page.locator('audio')).toHaveJSProperty('paused', false);
});

test('a failed authorization reports an error without private request details', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  const reports = [];
  await context.route('**/music/playback-observations', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); });
  await context.route('**/music/playback-grants', route => route.abort());
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ action: 'start', outcome: 'error', grantMs: null, readyMs: null });
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('switching tracks cancels only the old timing attempt', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  const reports = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let received;
  const pending = new Promise(resolve => { received = resolve; });
  await context.route('**/music/playback-observations', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); });
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  await expect.poll(() => reports.length).toBe(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  reports.length = 0;
  await context.route('**/music/playback-grants', async route => { received(); await gate; await route.continue(); }, { times: 1 });
  await page.locator('.track-play').nth(1).click();
  await pending;
  await page.locator('.track-play').first().click();
  release();
  await expect.poll(() => reports.length).toBe(2);
  expect(reports[0]).toMatchObject({ outcome: 'cancelled', grantMs: null });
  expect(reports[1]).toMatchObject({ outcome: 'playing' });
  expect(reports[0].trackId).not.toBe(reports[1].trackId);
});

test('automatic grant recovery preserves the full resume measurement', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  const reports = [];
  await context.route('**/music/playback-observations', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); });
  await context.route('**/music/playback-grants/*', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ status: 401, json: { code: 'session_required', message: 'Session expired.', requestId: 'AAAAAAAAAAAAAAAA' } });
  }, { times: 1 });
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  await expect.poll(() => reports.length).toBe(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  reports.length = 0;
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => reports.find(report => report.outcome === 'playing')).toBeTruthy();
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ action: 'resume', outcome: 'playing' });
  expect(reports[0].elapsedMs).toBeGreaterThanOrEqual(250);
});

test('the real media service accepts the browser timing report', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await page.goto('/music/soliloquies-vol-i/');
  const delivered = page.waitForResponse(response => response.url().endsWith('/music/playback-observations') && response.request().method() === 'POST');
  await page.locator('.track-play').first().click();
  expect((await delivered).status()).toBe(204);
  await expect(page.locator('audio')).toHaveJSProperty('paused', false);
});
