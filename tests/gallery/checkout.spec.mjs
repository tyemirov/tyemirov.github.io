// @ts-check
import { readFile } from 'node:fs/promises';
import { test, expect } from '../music/test-fixtures.mjs';

test.beforeEach(async ({context}) => {
 await context.route(/loopaware\.mprlab\.com/,route=>route.abort());
 await context.addCookies([{name:'gallery-fixture',value:'checkout',url:'https://localhost:18443'}]);
});

async function checkout(page) {
 const site=await (await page.request.get('/data/site.json')).json();
 const artwork=site.gallery.artworks.find(artwork=>artwork.offer);
 await page.goto(`/gallery/artworks/${artwork.id}/`);
 await page.getByRole('button',{name:'Add to Basket',exact:true}).click();
 await page.getByRole('link',{name:/Basket/}).click();
 await page.getByRole('link',{name:'Checkout',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Checkout',exact:true})).toBeVisible();
}

test('basket checkout creates a server-priced order and completes a locally approved payment',async({page,context})=>{
 const requests=[];
 page.on('request',request=>{if(request.url()==='https://localhost:18444/gallery/orders' && request.method()==='POST') requests.push({body:request.postDataJSON(),key:request.headers()['idempotency-key'],authorization:request.headers().authorization});});
 await checkout(page);
 await expect(page.getByText('Test personal-use license.',{exact:true})).toBeVisible();
 await page.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your gallery order',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Continue to PayPal',exact:true})).toHaveCount(0);
 const secret=await page.getByLabel('Save this access code',{exact:true}).inputValue();
 expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
 const id=new URL(page.url()).searchParams.get("order");
 expect(id).toMatch(/^[a-f0-9-]{36}$/);
 const accessFile=page.waitForEvent('download');
 await page.getByRole('button',{name:'Save access details',exact:true}).click();
 const saved=await accessFile;
 const instructions=await readFile(await saved.path(),'utf8');
 expect(instructions).toContain(`/gallery/order/?order=${id}`);
 expect(instructions).toContain(`Access code: ${secret}`);
 await page.getByLabel('I saved my access code and accept this order',{exact:true}).check();
 const popupEvent=page.waitForEvent('popup');
 await page.getByRole('link',{name:'Continue to PayPal',exact:true}).click();
 const popup=await popupEvent;
 await popup.getByRole('button',{name:'Approve test payment',exact:true}).click();
 await expect(popup).toHaveURL(new RegExp(`/gallery/order/\\?order=${id}$`));
 await popup.close();
 await page.getByRole('button',{name:'Complete approved payment',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Waiting for payment verification');
 expect((await context.request.post(`/fixture-control/gallery/complete/${id}`)).status()).toBe(204);
 await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download original',exact:true}).click();
 const download=await downloadEvent;
 expect(await readFile(await download.path())).toEqual(await readFile('gallery/images/full/third-act-01.png'));
 expect(requests).toHaveLength(1);
 expect(requests[0].body).toEqual({offerIds:['browser-download'],email:'buyer@example.test',catalogDigest:expect.stringMatching(/^[0-9a-f]{64}$/)});
 expect(requests[0].key).toMatch(/^[a-f0-9-]{36}$/);
 expect(requests[0].authorization).toBeUndefined();
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(secret);
 await page.reload();
 await expect(page.getByLabel('Access code',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Save this access code',{exact:true})).toBeHidden();
});

test('checkout retry keeps one order after the creation response is lost',async({page})=>{
 await checkout(page);
 const attempts=[];
 let first;
 await page.route('https://localhost:18444/gallery/orders',async route=>{
  attempts.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
  const response=await route.fetch();
  first=await response.json();
  await route.abort('failed');
 },{times:1});
 await page.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('The gallery service is unavailable');
 await expect(page.getByLabel('Receipt email',{exact:true})).toHaveJSProperty('readOnly',true);
 page.on('request',request=>{if(request.url()==='https://localhost:18444/gallery/orders'&&request.method()==='POST') attempts.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']});});
 await page.getByRole('button',{name:'Retry order',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`\\?order=${first.order.id}$`));
 await expect(page.getByLabel('Save this access code',{exact:true})).toHaveValue(first.accessSecret);
 expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]);
});

test('checkout reloads a stale catalog and requires renewed buyer review',async({page,context})=>{
 let stale=true;
 page.on('request', request=>{if(request.url()==='https://localhost:18444/gallery/orders' && request.method()==='POST') stale=false;});
 await context.route('**/data/site.json',async route=>{
  const response=await route.fetch(); const site=await response.json();
  if(stale) site.gallery.artworks[0].offer.priceCents=9999;
  await route.fulfill({response,json:site});
 });
 await checkout(page);
 await expect(page.locator('#order-checkout')).toContainText('$99.99');
 await page.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('The catalog changed');
 await expect(page.locator('#order-checkout')).toContainText('$12.50');
 await expect(page.getByLabel('Receipt email',{exact:true})).toHaveValue('');
 await page.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(page.locator('.order-total')).toHaveText('Total: $12.50');
 await expect(page.getByRole('link',{name:'Continue to PayPal',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('I saved my access code and accept this order',{exact:true})).not.toBeChecked();
});

test('checkout rejects an unavailable offer and provides a return to the basket',async({page,context})=>{
 const site=await (await page.request.get('/data/site.json')).json();
 await page.goto(`/gallery/artworks/${site.gallery.artworks[0].id}/`);
 await page.getByRole('button',{name:'Add to Basket',exact:true}).click();
 await page.getByRole('link',{name:/Basket/}).click();
 await expect(page.getByRole('link',{name:'Checkout',exact:true})).toBeVisible();
 await context.route('**/data/site.json',async route=>{
  const response=await route.fetch(); const current=await response.json(); current.gallery.artworks[0].offer=null;
  await route.fulfill({response,json:current});
 });
 const creates=[]; page.on('request',request=>{if(request.url()==='https://localhost:18444/gallery/orders') creates.push(request.url());});
 await page.getByRole('link',{name:'Checkout',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Select up to twenty available works');
 await expect(page.getByRole('link',{name:'Return to basket',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create order',exact:true})).toHaveCount(0);
 expect(creates).toEqual([]);
});

test('checkout keeps a created order available when the browser cannot update its basket',async({page})=>{
 await checkout(page);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exhausted','QuotaExceededError');};});
 await page.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Awaiting payment approval');
 await expect(page.getByLabel('Save this access code',{exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('Your order is ready, but the basket could not be cleared');
 await page.getByLabel('I saved my access code and accept this order',{exact:true}).check();
 await expect(page.getByRole('link',{name:'Continue to PayPal',exact:true})).toBeVisible();
});

test('checkout updates the basket that remains open in another tab',async({page,context})=>{
 const site=await (await page.request.get('/data/site.json')).json();
 await page.goto(`/gallery/artworks/${site.gallery.artworks[0].id}/`);
 await page.getByRole('button',{name:'Add to Basket',exact:true}).click();
 await page.getByRole('link',{name:/Basket/}).click();
 const checkoutPage=await context.newPage();
 await checkoutPage.goto('/gallery/order/?checkout=1');
 await checkoutPage.getByLabel('Receipt email',{exact:true}).fill('buyer@example.test');
 await checkoutPage.getByRole('button',{name:'Create order',exact:true}).click();
 await expect(checkoutPage.getByLabel('Save this access code',{exact:true})).toBeVisible();
 await expect(page.getByText('Your basket is empty. Explore the gallery to find available works.',{exact:true})).toBeVisible();
 await expect(page.locator('#cart-count')).toHaveText('0');
});
