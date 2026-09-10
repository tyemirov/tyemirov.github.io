// @ts-check
import { element } from '../utils/dom.js';
import { offerDetails } from './exhibitDetail.js';

/** Render current offers before the server creates the immutable purchase snapshot. */
export function renderCheckout(container, items, onCreate) {
 const summary = element('div','order-items');
 for (const item of items) {
  const row = element('article','order-item');
  row.append(element('h2','',item.artwork.title));
  const details = offerDetails(item.artwork, () => {}); details.querySelector('button').remove();
  row.append(details); summary.append(row);
 }
 const form = element('form','order-access');
 const label = element('label','','Receipt email'); label.htmlFor='checkout-email';
 const email = element('input'); email.id='checkout-email'; email.type='email'; email.required=true; email.maxLength=254; email.autocomplete='email';
 const create = element('button','','Create order'); create.type='submit';
 form.append(label,email,element('p','','The server will confirm your price and terms before payment. No payment is taken when you create an order.'),create);
 form.addEventListener('submit',event=>{ event.preventDefault(); email.readOnly=true; onCreate(email.value.trim().toLowerCase(),create); });
 container.replaceChildren(summary,form,returnToBasket());
}

export function returnToBasket() { const link=element('a','link','Return to basket'); link.href='/gallery/cart/'; return link; }
