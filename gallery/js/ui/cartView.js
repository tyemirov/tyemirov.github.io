// @ts-check
import { element } from '../utils/dom.js';
import { STRINGS, ORDER_PAGE, CHECKOUT_QUERY } from '../constants.js';
import { offerDetails } from './exhibitDetail.js';

export function renderCartView(container, items, onRemove) {
  container.replaceChildren();
  if (!items.length) { container.append(element('p', '', STRINGS.emptyCart)); return; }
  for (const { id, artwork } of items) {
    const row = element('article', 'panel');
    if (artwork) {
      row.append(element('h3', '', artwork.title));
      const details = offerDetails(artwork, () => {});
      details.querySelector('button').remove(); row.append(details);
    } else row.append(element('p', 'alert', 'This offer is no longer available. Remove it from the basket.'));
    const remove = element('button', 'button secondary', 'Remove'); remove.type = 'button'; remove.addEventListener('click', () => onRemove(id)); row.append(remove);
    container.append(row);
  }
  if (items.every(item => item.artwork) && items.length <= 20 && new Set(items.map(item => item.artwork.offer.currency)).size === 1) {
    const checkout = element('a', 'button', 'Checkout'); checkout.href = `${ORDER_PAGE}?${CHECKOUT_QUERY}=1`; container.append(checkout);
  } else {
    const notice = element('p', 'alert', 'Select up to twenty available works in one currency before checkout.'); notice.setAttribute('role', 'status'); container.append(notice);
  }
}
