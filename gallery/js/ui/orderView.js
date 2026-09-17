// @ts-check
import { element } from '../utils/dom.js';

export const PAYMENT_LABELS = Object.freeze({
 'awaiting-approval':'Awaiting payment approval', 'payment-pending':'Waiting for payment verification', complete:'Payment complete', cancelled:'Order cancelled', revoked:'Payment refunded or reversed — downloads unavailable',
});
const RECEIPT_LABELS = Object.freeze({pending:'Your receipt is waiting to be sent.', queued:'Your receipt is being delivered.', sent:'Your receipt has been sent.', attention:'Your receipt needs support review.'});
const money = (cents, currency) => new Intl.NumberFormat('en-US', { style:'currency', currency }).format(cents/100);

/** @param {HTMLElement} container @param {import('../types.d.js').BuyerOrder} order @param {{refresh:()=>void, capture:()=>void, cancel:()=>void, close:()=>void, download:(offer:import('../types.d.js').SaleOffer)=>void}} actions */
export function renderOrder(container, order, actions, paymentPhase) {
 const total = element('p', 'order-total', `Total: ${money(order.totalCents, order.currency)}`);
 const buyer = element('p', '', `Receipt email: ${order.email}`);
 const items = element('ul', 'order-items');
 for (const item of order.items) {
  const entry = element('li', 'order-item');
  entry.append(element('h2','',item.title), element('p','',money(item.offer.priceCents,item.offer.currency)), element('p','',item.offer.license), element('p','order-file',`${item.offer.file.label} · ${item.offer.file.format} · ${item.offer.file.width} × ${item.offer.file.height} px`), element('p','',item.offer.deliveryTerms));
  if (order.status === 'complete' && order.entitlements.some(value => value.offerId === item.offer.id && value.status === 'active')) {
   const download = button('Download original', () => actions.download(item.offer));
   entry.append(download);
  }
  items.append(entry);
 }
 const controls = element('div','order-actions');
 controls.append(button('Check payment status', actions.refresh));
 if (order.status === 'awaiting-approval') {
  if (order.approvalUrl && paymentPhase === 'ready') {
   const approval = element('a','button secondary','Continue to PayPal'); approval.href = order.approvalUrl; approval.rel = 'noreferrer noopener'; approval.target = '_blank'; controls.append(approval);
  }
  if (paymentPhase === 'ready') controls.append(button('Complete approved payment', actions.capture));
  controls.append(button('Cancel unpaid order', actions.cancel));
 } else if (order.status === 'payment-pending' && paymentPhase === 'ready') controls.append(button('Check approved payment', actions.capture));
 controls.append(button('Close order', actions.close));
 const receipt = element('p','order-receipt',order.receipt ? RECEIPT_LABELS[order.receipt.status] : 'A receipt will be sent after payment verification.');
 container.replaceChildren(total,buyer,items);
 if (!['cancelled','revoked'].includes(order.status)) container.append(receipt);
 container.append(controls);
 if (order.status === 'complete') container.append(element('p','order-file','Each download requests a fresh ten-minute link for your purchased revision.'));
}
function button(label, action) { const button = element('button','secondary',label); button.type = 'button'; button.addEventListener('click',action); return button; }
