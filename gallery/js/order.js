// @ts-check
import { createOrderClient, ORDER_ID, OrderClientError, OrderAPIError } from './core/orders.js';
import { fetchGallerySnapshot } from './core/gateway.js';
import { createCartManager } from './core/cart.js';
import { renderCheckout, returnToBasket } from './ui/checkoutView.js';
import { ORDER_PAGE, CHECKOUT_QUERY } from './constants.js';
import { renderOrder, PAYMENT_LABELS } from './ui/orderView.js';
import { initializeSiteFooter } from '/assets/js/footer.js';

const form = document.getElementById('order-access');
const input = document.getElementById('access-code');
const details = document.getElementById('order-details');
const status = document.getElementById('order-status');
const errorNotice = document.getElementById('order-error');
const checkout = document.getElementById('order-checkout');
const recovery = document.getElementById('order-recovery');
const recoveryCode = document.getElementById('created-access-code');
const acceptance = document.getElementById('accept-created-order');
const objectURLs = new Map();
let shownOrder;
let checkoutAttempt;

let controller;
let generation = 0;
let client;
let orderID = '';
let secret = '';
let busy = false;

void initializeSiteFooter();
function setBusy(value) { busy = value; for (const button of document.querySelectorAll('.buyer-order button')) button.disabled = value; }
function showError(error) {
 errorNotice.textContent = error instanceof OrderClientError ? error.message : 'The gallery service is unavailable. Try again later.';
 errorNotice.hidden = false;
}
function releaseDownloads() {
 for (const [url, timer] of objectURLs) { clearTimeout(timer); URL.revokeObjectURL(url); }
 objectURLs.clear();
}
function clearOrder() {
 generation++; controller?.abort(); client = null; secret = ''; input.value = ''; orderID = ''; shownOrder = null; checkoutAttempt = null;
 document.getElementById('order-number').textContent = '';
 checkout.replaceChildren(); checkout.hidden = true; recovery.hidden = true; recoveryCode.value = ''; acceptance.checked = false;
 details.replaceChildren(); details.hidden = true; form.hidden = false; errorNotice.hidden = true;
 releaseDownloads(); setBusy(true);
}
async function initialize() {
 clearOrder();
 const current = generation;
 controller = new AbortController();
 if (new URLSearchParams(location.search).get(CHECKOUT_QUERY) === '1') { await initializeCheckout(current); return; }
 document.querySelector('.buyer-order h1').textContent = 'Your gallery order';
 const parameters = new URLSearchParams(location.search);
 const selectedOrder = parameters.get('order');
 if (!selectedOrder || !ORDER_ID.test(selectedOrder)) { status.textContent = 'Open the complete order link from checkout or your receipt.'; return; }
 orderID = selectedOrder;
 const cancelled = parameters.get('cancelled') === '1';
 history.replaceState(null, '', `${ORDER_PAGE}?order=${orderID}${cancelled ? '&cancelled=1' : ''}`);
 document.getElementById('order-number').textContent = `Order ${orderID}`;
 status.textContent = cancelled ? 'Payment approval was cancelled. Enter your access code to check or cancel the order.' : 'Enter your access code to open this order.';
 try { const configured = await createOrderClient(controller.signal); if (current !== generation) return; client = configured; setBusy(false); }
 catch (error) { if (current === generation) { showError(error); status.textContent = 'Order access is unavailable.'; } }
}
async function run(operation) {
 if (busy || !client) return;
 const current = generation;
 setBusy(true); errorNotice.hidden = true;
 try { await operation(current); }
 catch (error) { if (current === generation) showError(error); }
 finally { if (current === generation) setBusy(false); }
}
function showOrder(order) {
 shownOrder = order;
 input.value = ''; form.hidden = true; details.hidden = false;
 status.textContent = PAYMENT_LABELS[order.status];
 renderOrder(details, order, {
  refresh: () => void run(async current => { const next = await client.read(orderID,secret); if (current === generation) showOrder(next); }),
  capture: () => void run(async current => { const next = await client.capture(orderID,secret); if (current === generation) showOrder(next); }),
  cancel: () => void run(async current => { const next = await client.cancel(orderID,secret); if (current === generation) showOrder(next); }),
  close: () => { void initialize().then(() => input.focus()); },
  download: offer => void run(async current => {
   const result = await client.download(orderID,secret,offer);
   if (current !== generation) return;
   saveFile(result.blob,result.filename);
  }),
 }, recovery.hidden || acceptance.checked ? 'ready' : 'review');
}
form.addEventListener('submit', event => {
 event.preventDefault();
 const candidate = input.value;
 void run(async current => { const order = await client.read(orderID,candidate); if (current !== generation) return; secret = candidate; showOrder(order); });
});
function saveFile(blob,filename) {
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a'); link.href=url; link.download=filename;
 document.body.append(link); link.click(); link.remove();
 const timer=setTimeout(()=>{ URL.revokeObjectURL(url); objectURLs.delete(url); },1000);
 objectURLs.set(url,timer);
}
async function initializeCheckout(current) {
 form.hidden=true;
 document.querySelector('.buyer-order h1').textContent='Checkout';
 status.textContent='Loading current offers…';
 try {
  const [configured,snapshot]=await Promise.all([createOrderClient(controller.signal),fetchGallerySnapshot(controller.signal)]);
  if (current!==generation) return;
  const { gallery: catalog, catalogDigest } = snapshot;
  const items=createCartManager(catalog).items();
  if (!items.length || items.length>20 || items.some(item=>!item.artwork) || new Set(items.map(item=>item.artwork.offer.currency)).size!==1) throw new OrderClientError('Select up to twenty available works in one currency from your basket.');
  client=configured; checkout.hidden=false;
  renderCheckout(checkout,items,(email,button)=>void run(async attemptGeneration=>{
   checkoutAttempt ??= {key:crypto.randomUUID(),email,offerIds:items.map(item=>item.id)};
   button.textContent='Retry order';
   let created;
   try { created=await client.create(checkoutAttempt.offerIds,checkoutAttempt.email,checkoutAttempt.key,catalogDigest); }
   catch(error) {
    if(error instanceof OrderAPIError && error.code==='catalog_changed' && attemptGeneration===generation) {
     checkoutAttempt=null;
     await initializeCheckout(attemptGeneration);
     showError(new OrderClientError('The catalog changed. Review the current prices and terms, then create a new order.'));
     return;
    }
    throw error;
   }
   if(attemptGeneration!==generation) return;
   orderID=created.order.id; secret=created.accessSecret;
   history.replaceState(null,'',`${ORDER_PAGE}?order=${orderID}`);
   checkout.replaceChildren(); checkout.hidden=true;
   document.querySelector('.buyer-order h1').textContent='Your gallery order';
   document.getElementById('order-number').textContent=`Order ${orderID}`;
   recoveryCode.value=secret; recovery.hidden=false;
   showOrder(created.order);
   try {
    const basket=createCartManager(catalog);
    for(const item of created.order.items) basket.remove(item.offer.id);
   } catch(error) {
    throw new OrderClientError('Your order is ready, but the basket could not be cleared. Keep using this order.', {cause:error});
   }
  }));
  status.textContent='Review the selected works and enter your receipt email.';
  setBusy(false);
 } catch(error) { if(current===generation) {showError(error); status.textContent='Checkout is unavailable. Return to the basket to review your selection.'; checkout.hidden=false; checkout.replaceChildren(returnToBasket());} }
}
acceptance.addEventListener('change',()=>{if(shownOrder) showOrder(shownOrder);});
document.getElementById('save-order-access').addEventListener('click',()=>{
 if (!secret || !orderID) return;
 saveFile(new Blob([`Gallery order\n${location.origin}${ORDER_PAGE}?order=${orderID}\n\nAccess code: ${secret}\nKeep this code private.\n`],{type:'text/plain;charset=utf-8'}),`gallery-order-${orderID}.txt`);
});
window.addEventListener('popstate', () => void initialize());
window.addEventListener('pagehide', () => { clearOrder(); status.textContent = 'Enter your access code to open this order.'; });
window.addEventListener('pageshow', event => { if (event.persisted) void initialize(); });
void initialize();
