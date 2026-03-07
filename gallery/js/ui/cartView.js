// @ts-check
import { PAYPAL_CONTAINER_ID, STRINGS } from '../constants.js';
import { assertElement, clearChildren, hideElement, showElement } from '../utils/dom.js';
import { formatCurrency } from '../utils/number.js';

/**
 * @param {HTMLElement} container
 * @param {import('../types.d.js').CartItem[]} items
 * @param {{
 *  currency: string;
 *  onRemove: (artworkId: string) => void;
 *  onQuantityChange: (artworkId: string, quantity: number) => void;
 *  subtotal: number;
 * }} options
 */
export function renderCartView(container, items, options) {
  assertElement(container);
  const { currency, onRemove, onQuantityChange, subtotal } = options;

  clearChildren(container);

  if (items.length === 0) {
    hideElement(container);
    return;
  }

  showElement(container);

  container.insertAdjacentHTML(
    'beforeend',
    `
      <div class="cart-table-wrapper">
        <table class="cart-table" aria-describedby="cart-heading">
          <thead>
            <tr>
              <th scope="col">Artwork</th>
              <th scope="col">Details</th>
              <th scope="col" class="numeric">Price</th>
              <th scope="col" class="numeric">Qty</th>
              <th scope="col" class="numeric">Subtotal</th>
              <th scope="col" class="numeric">Remove</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="cart-total">
        <span class="cart-total__label">Subtotal</span>
        <span class="cart-total__value">${formatCurrency(subtotal, currency)}</span>
        <div id="${PAYPAL_CONTAINER_ID}"></div>
      </div>
    `
  );

  const tbody = /** @type {HTMLElement} */ (container.querySelector('tbody'));

  items.forEach((item) => {
    const row = document.createElement('tr');
    const preview = item.preview || item.image;
    const lineTotal = formatCurrency(item.priceUsd * item.quantity, currency);

    row.innerHTML = `
      <td class="cart-figure">${preview ? `<img src="${preview}" alt="${item.title}" loading="lazy">` : ''}</td>
      <td>
        <p class="cart-line__title">${item.title}</p>
        <p class="cart-line__meta">${item.exhibitTitle}</p>
        <p class="cart-line__meta">${item.medium || STRINGS.artworksLabel}</p>
        ${item.editionLabel ? `<p class="cart-line__meta">${item.editionLabel}</p>` : ''}
      </td>
      <td class="numeric">${formatCurrency(item.priceUsd, currency)}</td>
      <td class="numeric">
        <input type="number" min="1" step="1" value="${item.quantity}" class="cart-qty" data-cart-quantity="${item.artworkId}" aria-label="Quantity for ${item.title}">
      </td>
      <td class="numeric">${lineTotal}</td>
      <td class="numeric">
        <button type="button" class="button secondary" data-cart-remove="${item.artworkId}" aria-label="Remove ${item.title}">Remove</button>
      </td>
    `;

    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-cart-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      const artworkId = target.getAttribute('data-cart-remove');
      if (artworkId) {
        onRemove(artworkId);
      }
    });
  });

  tbody.querySelectorAll('[data-cart-quantity]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      const artworkId = target.getAttribute('data-cart-quantity');
      const value = Number.parseInt(target.value, 10);
      if (artworkId) {
        onQuantityChange(artworkId, value);
      }
    });
  });
}

/**
 * @param {HTMLElement} container
 */
export function renderEmptyCart(container) {
  assertElement(container);
  clearChildren(container);
  showElement(container);
  container.insertAdjacentHTML('beforeend', `<div class="alert alert--info" role="status">${STRINGS.cartEmpty}</div>`);
}
