// @ts-check
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const config = Object.fromEntries(['PAYMENT_API_ORIGIN', 'PAYMENT_CHECKOUT_ORIGIN', 'PAYMENT_WEBSITE_ORIGIN', 'PAYMENT_GALLERY_ORIGIN', 'PAYMENT_CLIENT_ID', 'PAYMENT_MERCHANT_ID', 'PAYMENT_WEBHOOK_ID', 'PAYMENT_DATABASE', 'PAYMENT_CERTIFICATE', 'PAYMENT_KEY', 'GALLERY_PAYPAL_CLIENT_SECRET'].map(name => {
  const value = process.env[name];
  if (!value) throw new Error(`Local payment configuration requires ${name}.`);
  return [name, value];
}));
for (const name of ['PAYMENT_API_ORIGIN', 'PAYMENT_CHECKOUT_ORIGIN', 'PAYMENT_WEBSITE_ORIGIN', 'PAYMENT_GALLERY_ORIGIN']) {
  const value = new URL(config[name]);
  const protocol = name === 'PAYMENT_GALLERY_ORIGIN' ? 'http:' : 'https:';
  if (value.protocol !== protocol || value.origin !== config[name]) throw new Error(`Use an explicit origin for ${name}.`);
}
if (config.GALLERY_PAYPAL_CLIENT_SECRET.length < 32) throw new Error('Local payment credentials require at least 32 bytes.');
const localIDs = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tokenPath = '/v1/oauth2/token';
const ordersPath = '/v2/checkout/orders';
const verificationPath = '/v1/notifications/verify-webhook-signature';
const algorithm = 'LOCAL-HMAC-SHA256';
const certificateURL = config.PAYMENT_API_ORIGIN + '/certificate';
const secret = config.GALLERY_PAYPAL_CLIENT_SECRET;
const accessToken = createHmac('sha256', secret).update('local-payment-access').digest('base64url');
const database = new DatabaseSync(config.PAYMENT_DATABASE);
database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, request_body TEXT NOT NULL, record TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, body TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);`);
const approvalTemplate = await readFile(new URL('approval.html', import.meta.url), 'utf8');
const stopped = new AbortController();
const json = (response, status, value) => { response.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); response.end(JSON.stringify(value)); };
const equal = (left, right) => { const a = Buffer.from(left ?? ''), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a,b); };
const identifier = prefix => prefix + randomUUID().replaceAll('-', '').toUpperCase();
const signature = (id, time, event) => createHmac('sha256', secret).update(`${id}\n${time}\n${JSON.stringify(event)}`).digest('base64url');
function bad(message) { return Object.assign(new Error(message), { httpStatus:422 }); }
function shape(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value,field))) throw bad('Invalid local provider request shape.');
}
async function textBody(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 1048576) throw bad('Local provider request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
async function body(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw bad('Use application/json.');
  try { return JSON.parse(await textBody(request)); } catch { throw bad('Invalid local provider JSON.'); }
}
function order(id) {
  const stored = database.prepare('SELECT record FROM orders WHERE id=?').get(id);
  return stored ? JSON.parse(stored.record) : null;
}
function save(record) { database.prepare('UPDATE orders SET record=? WHERE id=?').run(JSON.stringify(record),record.id); }
function orderView(record) {
  const unit = structuredClone(record.unit);
  if (record.captureID) unit.payments = { captures:[{id:record.captureID,status:'COMPLETED',amount:unit.amount}] };
  return { id:record.id, status:record.captureID ? 'COMPLETED' : record.approved ? 'APPROVED' : 'PAYER_ACTION_REQUIRED', purchase_units:[unit], links:[{rel:'payer-action',method:'GET',href:`${config.PAYMENT_CHECKOUT_ORIGIN}/checkoutnow?token=${record.id}`}] };
}
function validatePurchase(input) {
  shape(input,['intent','payment_source','purchase_units']);
  shape(input.payment_source,['paypal']);
  shape(input.payment_source.paypal,['experience_context']);
  const experience = input.payment_source.paypal.experience_context;
  shape(experience,['shipping_preference','user_action','return_url','cancel_url']);
  if (input.intent !== 'CAPTURE' || !Array.isArray(input.purchase_units) || input.purchase_units.length !== 1 || experience.shipping_preference !== 'NO_SHIPPING' || experience.user_action !== 'PAY_NOW') throw bad('Use the gallery purchase contract.');
  const unit = input.purchase_units[0];
  shape(unit,['custom_id','amount','payee']); shape(unit.amount,['currency_code','value']); shape(unit.payee,['merchant_id']);
  if (!localIDs.test(unit.custom_id) || unit.payee.merchant_id !== config.PAYMENT_MERCHANT_ID || !/^[A-Z]{3}$/.test(unit.amount.currency_code) || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(unit.amount.value) || /^0(\.0{1,2})?$/.test(unit.amount.value)) throw bad('Invalid gallery purchase unit.');
  const returnURL = `${config.PAYMENT_WEBSITE_ORIGIN}/gallery/order/?order=${unit.custom_id}`;
  if (experience.return_url !== returnURL || experience.cancel_url !== returnURL+'&cancelled=1') throw bad('Use the configured gallery return URL.');
  return {unit,returnURL};
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value])); }

async function handle(request, response) {
  try {
    const url = new URL(request.url,config.PAYMENT_CHECKOUT_ORIGIN);
    if (request.method === 'GET' && url.pathname === '/readyz') { database.prepare('SELECT 1').get(); json(response,200,{ready:true}); return; }
    // Only approval resources are exposed through the browser-facing HTTP proxy.
    if (!request.socket.encrypted) {
      if (request.method === 'GET' && url.pathname === '/checkoutnow') {
        const record = order(url.searchParams.get('token'));
        if (!record) { json(response,404,{name:'ORDER_NOT_FOUND'}); return; }
        const values = { WEBSITE_ORIGIN:config.PAYMENT_WEBSITE_ORIGIN, ORDER_ID:record.id, TOTAL:record.unit.amount.currency_code+' '+record.unit.amount.value };
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin'});
        response.end(approvalTemplate.replace(/\{\{(WEBSITE_ORIGIN|ORDER_ID|TOTAL)\}\}/g,(_,name)=>escapeHTML(values[name]))); return;
      }
      const match = url.pathname.match(/^\/local-orders\/([A-Z0-9]{1,36})\/approvals$/);
      if (request.method === 'POST' && match) {
        request.resume();
        if (request.headers.origin !== config.PAYMENT_CHECKOUT_ORIGIN) { json(response,403,{name:'ORIGIN_REQUIRED'}); return; }
        const record = order(match[1]);
        if (!record) { json(response,404,{name:'ORDER_NOT_FOUND'}); return; }
        record.approved = true; save(record);
        response.writeHead(303,{Location:record.returnURL,'Cache-Control':'no-store'}); response.end(); return;
      }
      json(response,404,{name:'LOCAL_RESOURCE_NOT_FOUND'}); return;
    }
    if (url.pathname === tokenPath && request.method === 'POST') {
      if (!equal(request.headers.authorization,'Basic '+Buffer.from(config.PAYMENT_CLIENT_ID+':'+secret).toString('base64'))) { json(response,401,{name:'AUTHENTICATION_FAILURE'}); return; }
      if (new URLSearchParams(await textBody(request)).get('grant_type') !== 'client_credentials') throw bad('Use client_credentials.');
      json(response,200,{access_token:accessToken,token_type:'Bearer',expires_in:3600}); return;
    }
    if (!equal(request.headers.authorization,'Bearer '+accessToken)) { json(response,401,{name:'AUTHENTICATION_FAILURE'}); return; }
    if (url.pathname === verificationPath && request.method === 'POST') {
      const input = await body(request);
      const valid = input.auth_algo === algorithm && input.cert_url === certificateURL && input.webhook_id === config.PAYMENT_WEBHOOK_ID && typeof input.transmission_id === 'string' && typeof input.transmission_time === 'string' && equal(input.transmission_sig,signature(input.transmission_id,input.transmission_time,input.webhook_event));
      json(response,200,{verification_status:valid?'SUCCESS':'FAILURE'}); return;
    }
    if (url.pathname === ordersPath && request.method === 'POST') {
      const input = await body(request), purchase = validatePurchase(input), key = request.headers['paypal-request-id'];
      if (typeof key !== 'string' || !localIDs.test(key)) throw bad('Use a UUID PayPal-Request-Id.');
      const encoded = JSON.stringify(input);
      const existing = database.prepare('SELECT request_body,record FROM orders WHERE request_id=?').get(key);
      if (existing) {
        if (existing.request_body !== encoded) { json(response,409,{name:'REQUEST_CONFLICT'}); return; }
        json(response,200,orderView(JSON.parse(existing.record))); return;
      }
      const record = {id:identifier('O'),unit:purchase.unit,returnURL:purchase.returnURL,approved:false,captureID:''};
      database.prepare('INSERT INTO orders VALUES(?,?,?,?)').run(record.id,key,encoded,JSON.stringify(record));
      response.setHeader('Location',ordersPath+'/'+record.id); json(response,201,orderView(record)); return;
    }
    const match = url.pathname.match(/^\/v2\/checkout\/orders\/([A-Z0-9]{1,36})(\/capture)?$/);
    if (match) {
      const record = order(match[1]);
      if (!record) { json(response,404,{name:'RESOURCE_NOT_FOUND'}); return; }
      if (!match[2] && request.method === 'GET') { json(response,200,orderView(record)); return; }
      if (match[2] && request.method === 'POST') {
        shape(await body(request),[]);
        if (!localIDs.test(request.headers['paypal-request-id'] ?? '')) throw bad('Use a UUID PayPal-Request-Id.');
        if (!record.approved) { json(response,422,{name:'ORDER_NOT_APPROVED'}); return; }
        if (!record.captureID) {
          record.captureID = identifier('C');
          const event = {id:randomUUID(),event_type:'PAYMENT.CAPTURE.COMPLETED',resource_type:'capture',resource_version:'2.0',resource:{id:record.captureID,status:'COMPLETED',amount:record.unit.amount,supplementary_data:{related_ids:{order_id:record.id}}}};
          database.exec('BEGIN IMMEDIATE');
          try { save(record); database.prepare('INSERT INTO events(id,body) VALUES(?,?)').run(event.id,JSON.stringify(event)); database.exec('COMMIT'); }
          catch(error) { database.exec('ROLLBACK'); throw error; }
        }
        json(response,201,orderView(record)); return;
      }
      response.setHeader('Allow',match[2]?'POST':'GET'); json(response,405,{name:'METHOD_NOT_ALLOWED'}); return;
    }
    json(response,404,{name:'RESOURCE_NOT_FOUND'});
  } catch (error) {
    json(response,error.httpStatus ?? 500,{name:error.httpStatus ? 'INVALID_REQUEST':'LOCAL_PROVIDER_ERROR'});
    if (!error.httpStatus) process.stderr.write('Local payment request failed.\n');
  }
}

let delivering = false;
async function deliverEvents() {
  if (delivering || stopped.signal.aborted) return;
  delivering = true;
  try {
    const rows = database.prepare('SELECT id,body FROM events WHERE delivered=0 AND next_attempt<=? ORDER BY next_attempt,id LIMIT 20').all(Date.now());
    for (const row of rows) {
      if (stopped.signal.aborted) break;
      database.prepare('UPDATE events SET next_attempt=? WHERE id=?').run(Date.now()+2000,row.id);
      const id = randomUUID(), time = new Date().toISOString(), event = JSON.parse(row.body);
      try {
        const reply = await fetch(config.PAYMENT_GALLERY_ORIGIN+'/gallery/payment-events',{method:'POST',headers:{'Content-Type':'application/json','Paypal-Auth-Algo':algorithm,'Paypal-Cert-Url':certificateURL,'Paypal-Transmission-Id':id,'Paypal-Transmission-Time':time,'Paypal-Transmission-Sig':signature(id,time,event)},body:row.body,signal:AbortSignal.any([stopped.signal,AbortSignal.timeout(10000)])});
        await reply.body?.cancel();
        if ([202,204].includes(reply.status)) database.prepare('UPDATE events SET delivered=1 WHERE id=?').run(row.id);
      } catch { if (!stopped.signal.aborted) process.stderr.write('Local payment event delivery will retry.\n'); }
    }
  } finally { delivering = false; }
}
const browser = httpServer(handle);
const api = httpsServer({cert:await readFile(config.PAYMENT_CERTIFICATE),key:await readFile(config.PAYMENT_KEY)},handle);
browser.listen(8094,'0.0.0.0'); api.listen(8095,'0.0.0.0');
await Promise.all([once(browser,'listening'),once(api,'listening')]);
const worker = setInterval(()=>deliverEvents().catch(()=>process.stderr.write('Local payment event queue failed.\n')),500);
process.stderr.write('Local payment provider ready.\n');
let closing;
async function close() {
  if (closing) return closing;
  closing = (async()=>{
    stopped.abort(); clearInterval(worker);
    await Promise.all([browser,api].map(server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));
    while (delivering) await new Promise(resolve=>setTimeout(resolve,10));
    database.close();
  })();
  return closing;
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>close().catch(()=>{process.stderr.write('Local payment shutdown failed.\n');process.exitCode=1;}));
