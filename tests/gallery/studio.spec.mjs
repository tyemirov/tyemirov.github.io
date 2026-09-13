// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function prepare(context, credential = 'fixture-owner') {
  await context.addCookies([{ name:'gallery-fixture', value:'checkout', domain:'localhost', path:'/', secure:true }]);
  await context.route('https://cdn.jsdelivr.net/npm/js-yaml@5.4.1/dist/browser/js-yaml.umd.min.js', async route => route.fulfill({contentType:'application/javascript',body:await readFile('node_modules/js-yaml/dist/browser/js-yaml.umd.min.js')}));
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'application/javascript',body:`globalThis.google={accounts:{id:{initialize(options){this.options=options},renderButton(host,options){const button=document.createElement('button');button.setAttribute('aria-label','Sign in with Google');button.textContent=options.type==='icon'?'G':'Sign in with Google';if(options.type==='icon'){button.style.cssText='width:30px;height:30px;padding:0;display:grid;place-items:center'}button.onclick=()=>{options.click_listener();this.options.callback({credential:${JSON.stringify(credential)},state:options.state})};host.replaceChildren(button)},disableAutoSelect(){},cancel(){}}}};`}));
}
async function login(page, context, credential) {
  await prepare(context,credential); await page.goto('/gallery/studio/');
  await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
}

test('Studio uses the shared login surface before it requests private workspace data', async ({ page, context }) => {
  await prepare(context);
  const protectedRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).origin === 'https://localhost:18444' && /\/gallery\/(assets|draft|publications|orders)(\/|\?|$)/.test(new URL(request.url()).pathname)) protectedRequests.push(request.url());
  });
  await page.goto('/gallery/studio/');
  await expect(page.getByRole('heading', { name: 'Gallery Studio', exact: true })).toBeVisible();
  await expect(page.locator('mpr-header[data-config-url="/config-ui.yaml"]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
  await expect(page.locator('#studio-workspace')).toBeHidden();
  expect(protectedRequests).toEqual([]);
});

test('an authenticated non-owner cannot open the Studio workspace', async ({ page, context }) => {
  await login(page,context,'fixture-reader');
  await expect(page.locator('#studio-status')).toHaveText('Only the gallery owner can open this workspace.');
  await expect(page.locator('#studio-workspace')).toBeHidden();
});

test('the owner uploads, edits, saves, reloads, and exports a reviewed draft', async ({ page, context }) => {
  await login(page,context,'fixture-owner');
  await expect(page.locator('#studio-workspace')).toBeVisible();
  const asset={id:createHash('sha256').update(await readFile('gallery/images/full/third-act-02.png')).digest('hex')};
  await page.getByLabel('Upload images').setInputFiles('gallery/images/full/third-act-02.png');
  await page.locator(`[data-asset-id="${asset.id}"]`).getByRole('button',{name:'Create artwork',exact:true}).click();
  const id=`studio-work-${crypto.randomUUID()}`;
  await page.getByLabel('Artwork ID',{exact:true}).fill(id);
  await page.getByLabel('Artwork title',{exact:true}).fill(id);
  await page.getByLabel('Image description',{exact:true}).fill('Image prepared in the owner workflow.');
  await page.getByLabel('Alt text',{exact:true}).fill('A test image from the gallery.');
  await page.getByLabel('Medium',{exact:true}).fill('Digital image');
  await page.getByLabel('Year',{exact:true}).fill('2026');
  await page.getByRole('button',{name:'Apply artwork',exact:true}).click();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('#studio-status')).toHaveText('Draft saved.');
  await page.reload();
  await expect(page.locator('#studio-workspace')).toBeVisible();
  await expect(page.getByRole('heading',{name:id,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Publication preview'})).toBeVisible();
  await page.getByRole('button',{name:'Phone',exact:true}).click();
  await page.getByLabel('I reviewed this draft for publication').check();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export publication',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/^gallery-publication-[a-f0-9]{64}\.zip$/);
});

test('draft conflicts preserve local edits until the owner chooses to reload', async ({ page, context }) => {
  await login(page,context,'fixture-owner'); await expect(page.locator('#studio-workspace')).toBeVisible();
  const second=await context.newPage(); await second.goto('/gallery/studio/'); await expect(second.locator('#studio-workspace')).toBeVisible();
  await second.getByRole('button',{name:/^Edit /}).first().click();
  await second.getByLabel('Artwork title',{exact:true}).fill(`Concurrent title ${crypto.randomUUID()}`);
  await second.getByRole('button',{name:'Apply artwork',exact:true}).click();
  await second.getByRole('button',{name:'Save draft',exact:true}).click(); await expect(second.locator('#studio-status')).toHaveText('Draft saved.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('#studio-status')).toContainText('changed in another session');
  await expect(page.getByRole('button',{name:'Reload saved draft',exact:true})).toBeVisible();
});

test('collections and exhibits preserve independent artwork order with keyboard controls', async ({ page, context }) => {
  await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
  await page.getByRole('button',{name:'Collections',exact:true}).click();await page.getByRole('button',{name:'New collection',exact:true}).click();
  const id=`collection-${crypto.randomUUID()}`;
  await page.getByLabel('Collection ID',{exact:true}).fill(id);await page.getByLabel('Collection title',{exact:true}).fill(id);
  await page.getByLabel('Introduction',{exact:true}).fill('A collection arranged in Studio.');
  await page.getByLabel('Add artwork',{exact:true}).selectOption('third-act-triptych-01');await page.getByRole('button',{name:'Add selected artwork',exact:true}).click();
  await page.getByLabel('Add artwork',{exact:true}).selectOption('third-act-triptych-02');await page.getByRole('button',{name:'Add selected artwork',exact:true}).click();
  const up=page.locator('.studio-order-list li').nth(1).getByRole('button',{name:/^Move up/});await up.focus();await page.keyboard.press('Enter');
  await page.getByLabel('Cover artwork',{exact:true}).selectOption('third-act-triptych-02');await page.getByLabel('Cover crop horizontal').fill('35');
  await page.getByRole('button',{name:'Apply collection',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('#studio-status')).toHaveText('Draft saved.');
  const saved=await (await page.request.get('https://localhost:18444/gallery/draft')).json();
  expect(saved.gallery.collections.find(group=>group.id===id).artworkIds).toEqual(['third-act-triptych-02','third-act-triptych-01']);
  expect(saved.gallery.collections.find(group=>group.id===id).coverPosition).toEqual([35,50]);
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator(`[data-preview-cover="${id}"]`)).toHaveCSS('object-position','35% 50%');
  await page.getByRole('button',{name:'Close preview',exact:true}).click();
  await page.getByRole('button',{name:'Exhibits',exact:true}).click();await page.getByRole('button',{name:'New exhibit',exact:true}).click();
  const exhibit=`exhibit-${crypto.randomUUID()}`;
  await page.getByLabel('Exhibit ID',{exact:true}).fill(exhibit);await page.getByLabel('Exhibit title',{exact:true}).fill(exhibit);
  await page.getByLabel('Introduction',{exact:true}).fill('A dated exhibit.');await page.getByLabel('Subtitle',{exact:true}).fill('An independent arrangement');
  await page.getByLabel('Start date').fill('2026-09-10');await page.getByLabel('End date').fill('2026-10-10');
  await page.getByRole('button',{name:'Add section',exact:true}).click();await page.getByLabel('Section title',{exact:true}).fill('Opening');
  await page.getByLabel('Add artwork',{exact:true}).selectOption('third-act-triptych-01');await page.getByRole('button',{name:'Add selected artwork',exact:true}).click();
  await page.getByLabel('Add artwork',{exact:true}).selectOption('third-act-triptych-02');await page.getByRole('button',{name:'Add selected artwork',exact:true}).click();
  await page.getByLabel('Cover artwork',{exact:true}).selectOption('third-act-triptych-01');
  await page.getByRole('button',{name:'Apply exhibit',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('#studio-status')).toHaveText('Draft saved.');
  const result=await (await page.request.get('https://localhost:18444/gallery/draft')).json();
  expect(result.gallery.exhibits.find(group=>group.id===exhibit).sections[0].artworkIds).toEqual(['third-act-triptych-01','third-act-triptych-02']);
  expect(result.gallery.collections.find(group=>group.id===id).artworkIds).toEqual(['third-act-triptych-02','third-act-triptych-01']);
});

test('owner orders require a verified email before access reissue and clear private UI on logout', async ({ page, context }) => {
  const response=await page.request.post('/fixture-control/gallery/orders');const created=await response.json();
  await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
  await page.getByRole('button',{name:'Orders',exact:true}).click();
  const order=page.locator(`[data-order-id="${created.order.id}"]`);await order.getByRole('button',{name:'Open order',exact:true}).click();
  await order.getByLabel('Verified buyer email',{exact:true}).fill('wrong@example.test');await order.getByRole('button',{name:'Reissue access',exact:true}).click();
  await expect(page.locator('#studio-status')).toContainText('email');await expect(order.getByLabel('Order access code',{exact:true})).toHaveCount(0);
  await order.getByLabel('Verified buyer email',{exact:true}).fill('buyer@example.test');await order.getByRole('button',{name:'Reissue access',exact:true}).click();
  const secret=await order.getByLabel('Order access code',{exact:true}).inputValue();expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),secret)).toBe(false);
  expect(page.url()).not.toContain(secret);
  await page.locator('mpr-header [data-mpr-user=trigger]').click();
  await page.locator('mpr-header [data-mpr-user=logout]').click();
  await expect(page.locator('#studio-workspace')).toBeHidden();await expect(page.getByLabel('Order access code',{exact:true})).toHaveCount(0);
});

test('unapplied edits require an explicit choice before leaving the editor', async ({page,context})=>{
  await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
  await page.getByRole('button',{name:/^Edit /}).first().click();
  await page.getByLabel('Image description',{exact:true}).fill('Unapplied local description.');
  const dialog=page.waitForEvent('dialog');
  const navigation=page.getByRole('button',{name:'Collections',exact:true}).click();
  await (await dialog).dismiss();await navigation;
  await expect(page.getByLabel('Image description',{exact:true})).toHaveValue('Unapplied local description.');
});

test('failed uploads and draft saves remain visible and permit a deliberate retry',async({page,context})=>{
  await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
  await page.getByLabel('Upload images').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});
  await expect(page.getByRole('list',{name:'Upload progress'})).toContainText('valid image');
  await page.getByRole('button',{name:/^Edit /}).first().click();
  const description=`Local description ${crypto.randomUUID()}`;
  await page.getByLabel('Image description',{exact:true}).fill(description);await page.getByRole('button',{name:'Apply artwork',exact:true}).click();
  await page.route('https://localhost:18444/gallery/draft',route=>route.request().method()==='PUT'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'storage_unavailable',message:'Draft storage is unavailable.',requestId:crypto.randomUUID()})}):route.continue());
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('#studio-status')).toHaveText('Draft storage is unavailable.');
  await expect(page.locator('#studio-save-state')).toHaveText('Unsaved changes');
  await page.unroute('https://localhost:18444/gallery/draft');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.locator('#studio-status')).toHaveText('Draft saved.');
  await page.reload();await page.getByRole('button',{name:/^Edit /}).first().click();await expect(page.getByLabel('Image description',{exact:true})).toHaveValue(description);
});

test('Studio retains local edits across shared session recovery and fits three viewport widths',async({page,context})=>{
  await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
  await page.getByRole('button',{name:/^Edit /}).first().click();
  const title=`Unsaved title ${crypto.randomUUID()}`;await page.getByLabel('Artwork title',{exact:true}).fill(title);await page.getByRole('button',{name:'Apply artwork',exact:true}).click();
  let calls=0;
  await page.route('https://localhost:18444/gallery/orders?*',route=>++calls===1?route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'session_required',message:'Session required.',requestId:crypto.randomUUID()})}):route.continue());
  await page.getByRole('button',{name:'Orders',exact:true}).click();await expect(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
  await expect.poll(()=>calls).toBe(2);
  await page.getByRole('button',{name:'Library',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  for(const width of [390,769,1280]){
    await page.setViewportSize({width,height:900});
    const overflow=await page.locator('body *').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().right>innerWidth+1).map(element=>({tag:element.tagName,class:element.className,width:element.getBoundingClientRect().width})));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth),JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`output/playwright/site-redesign/studio-${test.info().project.name}-${width}.png`,fullPage:true});
  }
});


test('Studio filters orders with every canonical status',async({page,context})=>{
 await login(page,context,'fixture-owner');await expect(page.locator('#studio-workspace')).toBeVisible();
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 const schema=JSON.parse(await readFile('contracts/gallery.schema.json','utf8'));
 for(const status of schema.$defs.order.properties.status.enum){
  await page.getByLabel('Order status',{exact:true}).selectOption(status);
  const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/gallery/orders' && new URL(response.url()).searchParams.get('status')===status);
  await page.getByRole('button',{name:'Find orders',exact:true}).click();
  const result=await response;expect(result.status()).toBe(200);
  expect((await result.json()).items.every(order=>order.status===status)).toBe(true);
 }
});


test('Gallery offers shared sign-in and opens the authenticated Studio',async({page,context})=>{
 await prepare(context,'fixture-owner');await page.setViewportSize({width:390,height:900});await page.goto('/gallery/');
 await expect(page.getByRole('link',{name:'Exhibits',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
 await expect(page.locator('mpr-header')).toHaveAttribute('data-mpr-auth-status','authenticated');
 await page.getByRole('link',{name:'Studio',exact:true}).click();
 await expect(page.locator('#studio-workspace')).toBeVisible();
 await expect(page.getByLabel('Upload images')).toBeVisible();
 await expect(page.getByRole('button',{name:'Collections',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Orders',exact:true})).toBeVisible();
});
