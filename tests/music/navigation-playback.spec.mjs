// @ts-check
import { test, expect } from './test-fixtures.mjs';

test('music continues in the same audio element across pages and browser history', async ({page,context}) => {
  await context.addCookies([{name:'music-fixture',value:'player',domain:'localhost',path:'/'}]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  const audio=page.locator('#music-player audio');
  await expect.poll(()=>audio.evaluate(node=>node.currentTime)).toBeGreaterThan(.3);
  await audio.evaluate(node=>{globalThis.navigationAudio=node;globalThis.navigationStart=node.currentTime;globalThis.navigationInterruptions=[];for(const event of ['pause','emptied','abort'])node.addEventListener(event,()=>globalThis.navigationInterruptions.push(event));});
  await page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link',{name:'Music',exact:true}).click();
  await expect(page).toHaveURL(/\/music\/$/);
  await expect(page.locator('.album-card').first()).toBeVisible();
  await expect(audio).toHaveCount(1);
  expect(await audio.evaluate(node=>node===globalThis.navigationAudio)).toBe(true);
  await page.getByRole('link',{name:'Home',exact:true}).click();
  await expect(page).toHaveURL(/https:\/\/localhost:\d+\/$/);
  await expect(page.locator('.hero-copy h1')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.album-card').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('.track-play').first()).toBeEnabled();
  expect(await audio.evaluate(node=>node===globalThis.navigationAudio&&!node.paused&&node.currentTime>globalThis.navigationStart)).toBe(true);
  expect(await page.evaluate(()=>globalThis.navigationInterruptions)).toEqual([]);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link',{name:'Music',exact:true}).click();
  await expect(audio).toHaveJSProperty('paused',true);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(audio).toHaveJSProperty('paused',false);
});


test('page requests fail safely and another album replaces the queue only when selected', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  const audio = page.locator('#music-player audio');
  await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.3);
  await audio.evaluate(node => { globalThis.navigationAudio = node; node.volume = .4; });
  const track = await page.locator('.player-track').innerText();
  await context.route('**/music/', route => route.fulfill({ status: 503, body: 'Unavailable' }), { times: 1 });
  await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Music', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The page could not load');
  await expect(page).toHaveURL(/soliloquies-vol-i\/$/);
  await expect(page.locator('.track-play').first()).toBeVisible();
  expect(await audio.evaluate(node => node === globalThis.navigationAudio && !node.paused)).toBe(true);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.album-card').first()).toBeVisible();
  await page.locator('a.album-cover[href="/music/soliloquies-vol-ii/"]').click();
  await expect(page.locator('.track-play').first()).toBeEnabled();
  await expect(page.locator('.player-track')).toHaveText(track);
  await page.locator('.track-play').first().click();
  await expect(page.locator('.player-album')).toContainText('II');
  await expect(audio).toHaveJSProperty('paused', false);
  expect(await audio.evaluate(node => node === globalThis.navigationAudio && node.volume === .4)).toBe(true);
  await expect(page.getByRole('button', { name: 'Next track', exact: true })).toBeDisabled();
});

test('article filters, gallery controls, and model controls work when revisited with a persistent player', async ({ page, context }) => {
  test.setTimeout(60000);
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  const audio = page.locator('#music-player audio');
  await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.3);
  await audio.evaluate(node => { globalThis.navigationAudio = node; });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  async function home() {
    await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.locator('.hero-copy h1')).toBeVisible();
  }
  for (let visit = 0; visit < 2; visit++) {
    await home();
    await page.locator('a[href="/articles/"]').first().click();
    await page.locator('#article-filters').getByRole('button', { name: 'Modeling', exact: true }).click();
    await expect(page.locator('#article-list .project-card')).toHaveCount(3);
    await page.locator('#article-list a[href="/timeseries/"]').first().click();
    await page.locator('#example-button').click();
    await page.locator('#compute-button').click();
    await expect(page.locator('#result-state-value')).not.toHaveText('Pending...');
    await home();
    await page.locator('a[href="/gallery/"]').first().click();
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/\/gallery\/about\/$/);
    await page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Gallery', exact: true }).click();
    await page.getByRole('link', { name: 'Selected Works', exact: true }).click();
    await expect(page.locator('.artwork-card').first()).toBeVisible();
    await page.locator('[data-media]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await audio.evaluate(node => node === globalThis.navigationAudio && node.paused)).toBe(true);
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(audio).toHaveJSProperty('paused', false);
  expect(errors).toEqual([]);
});

test('a failed Back request after fragment history keeps the current page and player', async ({ page, context }) => {
  await context.addCookies([{ name: 'music-fixture', value: 'player', domain: 'localhost', path: '/' }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  await page.goto('/music/soliloquies-vol-i/');
  await page.locator('.track-play').first().click();
  const audio = page.locator('#music-player audio');
  await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(.2);
  await audio.evaluate(node => { globalThis.navigationAudio = node; });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.hero-links').getByRole('link', { name: 'Music', exact: true }).click();
  await page.locator('#music .section-actions a').click();
  await expect(page.locator('.album-card').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('.hero-copy h1')).toBeVisible();
  await expect(page).toHaveURL(/\/#music$/);
  await page.goForward();
  await expect(page.locator('.album-card').first()).toBeVisible();
  await context.route(url => url.pathname === '/', route => route.fulfill({ status: 503, body: 'Unavailable' }), { times: 1 });
  await page.goBack();
  await expect(page.locator('#site-navigation-error')).toContainText('The page could not load');
  await expect(page).toHaveURL(/\/music\/$/);
  await expect(page.locator('.album-card').first()).toBeVisible();
  expect(await audio.evaluate(node => node === globalThis.navigationAudio && node.paused)).toBe(true);
});
