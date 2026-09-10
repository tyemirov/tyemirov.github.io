// @ts-check
import { createHmac, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

const origin = 'https://localhost:18443';
const apiOrigin = 'https://localhost:18446';
const internalOrigin = 'http://127.0.0.1:18445';
const signingKey = 'gallery-browser-fixture-signing-key-never-production';

function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString()); }

export async function startGalleryFixture({ temporary, certificate, key, siteRoot, run, root }) {
  const publicRoot = join(temporary, 'gallery-catalog');
  await mkdir(join(publicRoot, 'data'), { recursive: true });
  await cp(join(siteRoot, 'gallery/images'), join(publicRoot, 'gallery/images'), { recursive: true });
  const site = JSON.parse(await readFile(join(siteRoot, 'data/site.json'), 'utf8'));
  await writeFile(join(publicRoot, 'data/site.json'), JSON.stringify(site));
  const orders = new Map();
  const creationKeys = new Map();
  const provider = createServer({ cert: await readFile(certificate), key: await readFile(key) }, async (request, response) => {
    try {
      if (request.url === '/v1/oauth2/token') { request.resume(); json(response, 200, { access_token: 'local-provider-access', token_type: 'Bearer', expires_in: 3600 }); return; }
      if (request.url === '/v1/notifications/verify-webhook-signature') { const input = await body(request); json(response, 200, { verification_status: input.transmission_sig === 'local-verified-event' ? 'SUCCESS' : 'FAILURE' }); return; }
      if (request.url === '/v2/checkout/orders' && request.method === 'POST') {
        const input = await body(request);
        const key = request.headers['paypal-request-id'];
        let record = creationKeys.get(key);
        if (!record) {
          const id = `ORDER${orders.size + 1}`;
          record = { id, captured: false, approved:false, returnURL:input.payment_source.paypal.experience_context.return_url, units: input.purchase_units };
          orders.set(id, record); creationKeys.set(key, record);
        }
        json(response, 201, { id: record.id, status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', method: 'GET', href: `${apiOrigin}/checkoutnow?token=${record.id}` }] }); return;
      }
      const checkout = new URL(request.url,apiOrigin);
      if (checkout.pathname === '/checkoutnow') {
        const record = orders.get(checkout.searchParams.get('token'));
        if (!record) { json(response,404,{}); return; }
        response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
        response.end(`<!doctype html><html lang="en"><head><script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script><meta charset="utf-8"><title>Local payment approval</title><link rel="icon" href="${origin}/favicon.png"></head><body><main><h1>Local payment approval</h1><p>This fixture does not transfer money.</p><form method="post" action="/fixture-paypal/${record.id}/approval"><button>Approve test payment</button></form></main></body></html>`); return;
      }
      const approval = request.url.match(/^\/fixture-paypal\/(ORDER\d+)\/approval$/);
      if (request.method === 'POST' && approval) {
        request.resume(); const record=orders.get(approval[1]);
        if (!record) { json(response,404,{}); return; }
        record.approved=true; response.writeHead(303,{Location:record.returnURL,'Cache-Control':'no-store'}); response.end(); return;
      }
      const match = request.url.match(/^\/v2\/checkout\/orders\/(ORDER\d+)(\/capture)?$/);
      if (match) {
        const record = orders.get(match[1]);
        if (!record) { json(response, 404, {}); return; }
        if (request.method === 'POST' && match[2]) { request.resume(); if (!record.approved) { json(response,422,{name:'ORDER_NOT_APPROVED'}); return; } record.captured = true; }
        const units = structuredClone(record.units);
        if (record.captured) units[0].payments = { captures: [{ id: `CAPTURE${record.id.slice(5)}`, status: record.refunded ? 'REFUNDED' : 'COMPLETED', amount: units[0].amount }] };
        json(response, 200, { id: record.id, status: record.captured ? 'COMPLETED' : record.approved ? 'APPROVED' : 'PAYER_ACTION_REQUIRED', purchase_units: units }); return;
      }
      const payment = request.url.match(/^\/v2\/payments\/(captures|refunds)\/(?:CAPTURE|REFUND)(\d+)$/);
      if (payment) {
        const record = orders.get(`ORDER${payment[2]}`);
        if (!record?.captured) { json(response, 404, {}); return; }
        const unit = record.units[0];
        if (payment[1] === 'captures') json(response, 200, { id:`CAPTURE${payment[2]}`, status:record.refunded?'REFUNDED':'COMPLETED', custom_id:unit.custom_id, amount:unit.amount, payee:unit.payee, supplementary_data:{related_ids:{order_id:record.id}} });
        else if (record.refunded) json(response, 200, { id:`REFUND${payment[2]}`, status:'COMPLETED', amount:unit.amount, links:[{rel:'up',method:'GET',href:`${apiOrigin}/v2/payments/captures/CAPTURE${payment[2]}`}] });
        else json(response,404,{});
        return;
      }
      const proxy = proxyRequest(internalOrigin + request.url, { method: request.method, headers: request.headers }, upstream => {
        response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response);
      });
      proxy.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.pipe(proxy);
    } catch (error) { json(response, 500, { message: 'Gallery provider fixture failed' }); process.stderr.write(`${error}\n`); }
  });
  provider.listen(18446, '127.0.0.1');
  await once(provider, 'listening');
  let processInstance;
  async function stop() {
    if (processInstance && processInstance.exitCode === null && processInstance.signalCode === null) { processInstance.kill('SIGTERM'); await once(processInstance, 'close'); }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
  }
  try {
    const binary = join(temporary, 'gallery');
    await run('go', ['build', '-o', binary, '../../tests/gallery/server/main.go'], join(root, 'services/gallery'));
    processInstance = spawn(binary, [`--database=${join(temporary, 'gallery.db')}`, `--public-root=${publicRoot}`, `--certificate=${certificate}`], {
      env: { ...process.env, GALLERY_TAUTH_SIGNING_KEY: signingKey }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      processInstance.stderr.on('data', chunk => { if (chunk.toString().includes('gallery ready')) resolve(); else process.stderr.write(chunk); });
      processInstance.once('error', reject);
      processInstance.once('exit', () => reject(new Error('Gallery browser fixture exited before readiness')));
    });
    const now = Math.floor(Date.now()/1000);
    const data = [{ alg: 'HS256', typ: 'JWT' }, { iss: 'tauth', user_id: 'fixture-owner', user_email: 'owner@example.test', tenant_id: 'gallery-browser', iat: now-60, exp: now+3600 }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const cookie = `gallery_browser_session=${data}.${createHmac('sha256', signingKey).update(data).digest('base64url')}`;
    const original = await readFile(join(siteRoot, 'gallery/images/full/third-act-01.png'));
    const upload = await fetch(internalOrigin+'/gallery/assets', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type':'image/png' }, body: original });
    if (upload.status !== 201) throw new Error(`Seed gallery image: HTTP ${upload.status}`);
    const asset = await upload.json();
    site.gallery.artworks[0].offer = { id: 'browser-download', priceCents: 1250, currency:'USD', license:'Test personal-use license.', revision: asset.id, file: { label:'Purchased original', format:'PNG', width: asset.width, height: asset.height }, deliveryTerms:'Test download after verified payment.' };
    await writeFile(join(publicRoot, 'data/site.json'), JSON.stringify(site));
    return {
      stop,
      async auth(request, response) {
        if (!request.url.startsWith('/auth/')) return false;
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With,X-TAuth-Tenant');
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        if (request.method === 'OPTIONS') { response.writeHead(204).end(); return true; }
        if (request.url === '/auth/nonce') { request.resume(); json(response, 200, { nonce: 'fixture-google-nonce' }); return true; }
        if (request.url === '/auth/google') {
          const input = await body(request);
          const email = input.google_id_token === 'fixture-reader' ? 'reader@example.test' : 'owner@example.test';
          const claims = { iss: 'tauth', user_id: email, user_email: email, tenant_id: 'gallery-browser', iat: now-60, exp: now+3600 };
          const token = [{alg:'HS256',typ:'JWT'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
          response.setHeader('Set-Cookie', `gallery_browser_session=${token}.${createHmac('sha256',signingKey).update(token).digest('base64url')}; Path=/; Secure; HttpOnly; SameSite=Strict`);
          json(response,200,{user_id:email,user_email:email,display:'Studio test user',avatar_url:''}); return true;
        }
        if (request.url === '/auth/logout') { request.resume(); response.setHeader('Set-Cookie','gallery_browser_session=; Path=/; Secure; HttpOnly; Max-Age=0'); response.writeHead(204).end(); return true; }
        if (request.url === '/auth/session') {
          const session = request.headers.cookie?.split('; ').find(value=>value.startsWith('gallery_browser_session='));
          if (!session) { response.writeHead(204).end(); return true; }
          const claims=JSON.parse(Buffer.from(session.split('.')[1],'base64url').toString());
          json(response,200,{user_id:claims.user_id,user_email:claims.user_email,display:'Studio test user',avatar_url:''}); return true;
        }
        response.writeHead(404).end(); return true;
      },
      async handle(request, response) {
        if (request.url === '/data/site.json' && request.headers.cookie?.split('; ').includes('gallery-fixture=checkout')) { json(response,200,site); return true; }
        if (request.url === '/config-site.json') { json(response, 200, { apiOrigin: 'https://localhost:18444' }); return true; }
        if (request.url === '/config-ui.yaml') {
          const config = JSON.parse(await readFile(join(siteRoot,'config-ui.yaml'),'utf8'));
          config.environments[0].origins=[origin]; config.environments[0].auth.tauthUrl='https://localhost:18444'; config.environments[0].auth.tenantId='gallery-browser';
          json(response,200,config); return true;
        }
        if (request.method !== 'POST' || !request.url.startsWith('/fixture-control/gallery/')) return false;
        if (request.url === '/fixture-control/gallery/orders') {
          const created = await fetch(internalOrigin+'/gallery/orders', { method: 'POST', headers: { Origin:origin, 'Content-Type':'application/json', 'Idempotency-Key':randomUUID() }, body: JSON.stringify({ offerIds:['browser-download'], email:'buyer@example.test', catalogDigest:createHash('sha256').update(JSON.stringify(site)).digest('hex') }) });
          const payload = await created.json();
          // Order-page fixtures represent a buyer who already approved at PayPal.
          if (created.status === 201) [...orders.values()].find(record=>record.units[0].custom_id===payload.order.id).approved=true;
          json(response, created.status, payload); return true;
        }
        const match = request.url.match(/^\/fixture-control\/gallery\/(complete|refund)\/([a-f0-9-]+)$/);
        if (match) {
          const record = [...orders.values()].find(record => record.units[0].custom_id === match[2]);
          if (!record?.captured) { json(response, 409, { message:'Capture the payment before its completion event' }); return true; }
          if (match[1] === 'refund') record.refunded = true;
          const event = { id:randomUUID(), event_type:match[1] === 'refund' ? 'PAYMENT.CAPTURE.REFUNDED' : 'PAYMENT.CAPTURE.COMPLETED', resource:{ id:`${match[1] === 'refund' ? 'REFUND' : 'CAPTURE'}${record.id.slice(5)}`, status:'COMPLETED', amount:record.units[0].amount, supplementary_data:{ related_ids:{order_id:record.id} } } };
          const accepted = await fetch(internalOrigin+'/gallery/payment-events', { method:'POST', headers:{'Content-Type':'application/json', 'Paypal-Auth-Algo':'SHA256withRSA','Paypal-Cert-Url':apiOrigin+'/certificate','Paypal-Transmission-Id':randomUUID(),'Paypal-Transmission-Time':new Date().toISOString(),'Paypal-Transmission-Sig':'local-verified-event'}, body:JSON.stringify(event) });
          response.writeHead(accepted.status); response.end(await accepted.text()); return true;
        }
        json(response, 404, { message:'Unknown gallery fixture control' }); return true;
      },
    };
  } catch (error) { await stop(); throw error; }
}
