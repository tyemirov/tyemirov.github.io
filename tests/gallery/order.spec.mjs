// @ts-check
import { readFile } from 'node:fs/promises';
import { test, expect } from '../music/test-fixtures.mjs';

test.beforeEach(async ({ context }) => { await context.route(/loopaware\.mprlab\.com/, route => route.abort()); });

async function createOrder(context) {
 const response = await context.request.post('/fixture-control/gallery/orders');
 expect(response.status()).toBe(201);
 return response.json();
}

test('a buyer unlocks an order and downloads the exact purchased original after verified payment', async ({ page, context }) => {
 const created = await createOrder(context);
 const id = created.order.id;
 const requests = [];
 page.on('request', request => { requests.push({ url:request.url(), authorization:request.headers().authorization }); });
 await page.goto(`/gallery/order/?order=${id}`);
 await expect(page.getByRole('heading', { name:'Your gallery order', exact:true })).toBeVisible();
 await expect(page.getByLabel('Access code', { exact:true })).toBeVisible();
 expect(requests.filter(request => request.url.includes('/orders/'))).toEqual([]);
 await page.getByLabel('Access code', { exact:true }).fill('x'.repeat(43));
 await page.getByRole('button', { name:'Open order', exact:true }).click();
 await expect(page.getByRole('alert')).toContainText('The order ID or access code is incorrect');
 await page.getByLabel('Access code', { exact:true }).fill(created.accessSecret);
 await page.getByRole('button', { name:'Open order', exact:true }).click();
 await expect(page.getByText('Test personal-use license.', { exact:true })).toBeVisible();
 await expect(page.getByRole('status')).toContainText('Awaiting payment approval');
 await expect(page.getByRole('button', { name:'Download original', exact:true })).toHaveCount(0);
 await page.getByRole('button', { name:'Complete approved payment', exact:true }).click();
 await expect(page.getByRole('status')).toContainText('Waiting for payment verification');
 await expect(page.getByRole('button', { name:'Download original', exact:true })).toHaveCount(0);
 expect((await context.request.post(`/fixture-control/gallery/complete/${id}`)).status()).toBe(204);
 await page.getByRole('button', { name:'Check payment status', exact:true }).click();
 await expect(page.getByRole('status')).toContainText('Payment complete');
 const downloaded = page.waitForEvent('download');
 await page.getByRole('button', { name:'Download original', exact:true }).click();
 const download = await downloaded;
 expect(await download.failure()).toBeNull();
 expect(await readFile(await download.path())).toEqual(await readFile('gallery/images/full/third-act-01.png'));
 expect(requests.every(request => !request.url.includes(created.accessSecret))).toBe(true);
 const orderRequests = requests.filter(request => request.url.includes('/orders/'));
 expect(orderRequests[0].authorization).toBe(`Bearer ${'x'.repeat(43)}`);
 expect(orderRequests.slice(1).every(request => request.authorization === `Bearer ${created.accessSecret}`)).toBe(true);
 expect(await page.evaluate(() => JSON.stringify({ local:{...localStorage}, session:{...sessionStorage} }))).not.toContain(created.accessSecret);
 await page.reload();
 await expect(page.getByLabel('Access code', { exact:true })).toHaveValue('');
 await expect(page.getByText('Test personal-use license.', { exact:true })).toHaveCount(0);
});

async function paidOrder(context) {
 const created = await createOrder(context);
 const captured = await context.request.post(`https://localhost:18444/gallery/orders/${created.order.id}/captures`, { headers:{Origin:'https://localhost:18443',Authorization:`Bearer ${created.accessSecret}`}, data:{} });
 expect(captured.status()).toBe(202);
 expect((await context.request.post(`/fixture-control/gallery/complete/${created.order.id}`)).status()).toBe(204);
 return created;
}
async function openOrder(page, created) {
 await page.goto(`/gallery/order/?order=${created.order.id}`);
 await page.getByLabel('Access code', {exact:true}).fill(created.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await expect(page.getByText('Test personal-use license.',{exact:true})).toBeVisible();
}

test('buyer order access handles expired grants and a verified refund without losing the purchased terms', async ({ page, context }) => {
 const created = await paidOrder(context);
 await openOrder(page,created);
 await page.route('https://localhost:18444/gallery/downloads/*', route => route.fulfill({status:410,json:{code:'download_expired',message:'Expired fixture grant',requestId:'fixture-request'}}),{times:1});
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('The download link expired');
 await expect(page.getByText('Test personal-use license.',{exact:true})).toBeVisible();
 const next = page.waitForEvent('download');
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 expect(await (await next).failure()).toBeNull();
 expect((await context.request.post(`/fixture-control/gallery/refund/${created.order.id}`)).status()).toBe(204);
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('This purchase does not authorize that download');
 await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Payment refunded or reversed');
 await expect(page.getByRole('button',{name:'Download original',exact:true})).toHaveCount(0);
});

for (const width of [390,1280]) {
 test(`buyer order supports keyboard access and fits ${width}px`, async ({page,context}) => {
  const created = await paidOrder(context);
  await page.setViewportSize({width,height:844});
  await page.goto(`/gallery/order/?order=${created.order.id}`);
  await page.getByLabel('Access code',{exact:true}).fill(created.accessSecret);
  await page.getByLabel('Access code',{exact:true}).press('Enter');
  await expect(page.getByRole('status')).toContainText('Payment complete');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`output/playwright/gallery-order-${width}-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Close order',exact:true}).click();
  await expect(page.getByLabel('Access code',{exact:true})).toBeFocused();
  await expect(page.getByLabel('Access code',{exact:true})).toHaveValue('');
  await expect(page.getByText('Test personal-use license.',{exact:true})).toHaveCount(0);
 });
}

test('buyer cancellation persists and payment return query fields never authorize an order', async ({page,context}) => {
 const created = await createOrder(context);
 await page.goto(`/gallery/order/?order=${created.order.id}&cancelled=1&token=UNTRUSTED&PayerID=UNTRUSTED`);
 await expect(page.getByRole('status')).toContainText('Payment approval was cancelled');
 await expect(page).toHaveURL(new RegExp(`\\?order=${created.order.id}&cancelled=1$`));
 expect(new URL(page.url()).searchParams.has('token')).toBe(false);
 await page.getByLabel('Access code',{exact:true}).fill(created.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await page.getByRole('button',{name:'Cancel unpaid order',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Order cancelled');
 await page.reload();
 await page.getByLabel('Access code',{exact:true}).fill(created.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Order cancelled');
 await expect(page.getByRole('button',{name:'Complete approved payment',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Download original',exact:true})).toHaveCount(0);
});

test('buyer route changes discard private responses from the previous order', async ({page,context}) => {
 const previous = await paidOrder(context);
 const next = await createOrder(context);
 let release;
 const waiting = new Promise(resolve=>{release=resolve;});
 let received;
 const requested = new Promise(resolve=>{received=resolve;});
 await page.route(`https://localhost:18444/gallery/orders/${previous.order.id}`, async route => { const response = await route.fetch(); received(); await waiting; await route.fulfill({response}); });
 await page.goto(`/gallery/order/?order=${previous.order.id}`);
 await page.getByLabel('Access code',{exact:true}).fill(previous.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await requested;
 await page.evaluate(id=>{history.pushState(null,'',`?order=${id}`); dispatchEvent(new PopStateEvent('popstate'));},next.order.id);
 await expect(page.locator('#order-number')).toHaveText(`Order ${next.order.id}`);
 release();
 await expect(page.getByLabel('Access code',{exact:true})).toHaveValue('');
 await expect(page.getByText('Test personal-use license.',{exact:true})).toHaveCount(0);
 await page.getByLabel('Access code',{exact:true}).fill(next.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Awaiting payment approval');
});

test('buyer pages hide malformed provider responses and reject foreign download destinations', async ({page,context}) => {
 const created = await paidOrder(context);
 const path = `https://localhost:18444/gallery/orders/${created.order.id}`;
 await page.route(path, route=>route.fulfill({status:503,contentType:'text/plain',body:'private-provider-diagnostic'}),{times:1});
 await page.goto(`/gallery/order/?order=${created.order.id}`);
 await page.getByLabel('Access code',{exact:true}).fill(created.accessSecret);
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('The gallery service is unavailable. Try again later.');
 await expect(page.locator('body')).not.toContainText('private-provider-diagnostic');
 await page.getByRole('button',{name:'Open order',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Payment complete');
 const foreign = [];
 page.on('request', request=>{if(request.url().includes('untrusted.example')) foreign.push(request.url());});
 await page.route(path+'/download-links', async route=>{
  const response = await route.fetch();
  const grant = await response.json(); grant.download.href = 'https://untrusted.example/stolen';
  await route.fulfill({response,json:grant});
 },{times:1});
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('The gallery returned an invalid response');
 expect(foreign).toEqual([]);
 await page.route('https://localhost:18444/gallery/downloads/*', route=>route.fulfill({status:200,contentType:'image/png',body:'changed-original-bytes'}),{times:1});
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('did not match your purchased revision');
 await expect(page.getByText('Test personal-use license.',{exact:true})).toBeVisible();
});
