// @ts-check
import { STRINGS } from '../constants.js';
import { buildMuseumLabel } from '../utils/artwork.js';
import { assertElement, clearChildren } from '../utils/dom.js';
import { formatCurrency } from '../utils/number.js';

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string | undefined}
 */
function buildEditionLabel(artwork) {
  const { editionNumber, editionSize } = artwork;
  if (!editionNumber && !editionSize) {
    return undefined;
  }
  if (editionNumber && editionSize) {
    return `Edition ${editionNumber} of ${editionSize}`;
  }
  if (editionNumber) {
    return `Edition ${editionNumber}`;
  }
  return editionSize ? `Edition of ${editionSize}` : undefined;
}

/**
 * @param {HTMLElement} container
 * @param {import('../types.d.js').CollectionArtwork[]} artworks
 * @param {{
 *  currency: string;
 *  onAddToCart: (artwork: import('../types.d.js').CollectionArtwork) => void;
 *  onViewExhibit: (exhibitId: string) => void;
 * }} options
 */
export function renderCollectionSection(container, artworks, options) {
  assertElement(container);
  const { currency, onAddToCart, onViewExhibit } = options;
  clearChildren(container);

  const header = document.createElement('div');
  header.className = 'collection-section__header';
  header.innerHTML = `
    <h2 class="collection-section__title">${STRINGS.collectionTitle}</h2>
    <p class="collection-section__lead">${STRINGS.collectionLead}</p>
  `;
  container.appendChild(header);

  if (!Array.isArray(artworks) || artworks.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="collection-section__empty">${STRINGS.collectionEmpty}</div>`
    );
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'collection-section__grid';
  container.appendChild(grid);

  const itemsById = new Map();

  artworks.forEach((artwork) => {
    itemsById.set(artwork.id, artwork);
    const card = document.createElement('article');
    card.className = 'artwork-card';
    const preview = artwork.preview || artwork.image;
    const editionLabel = buildEditionLabel(artwork);
    card.innerHTML = `
      <div class="artwork-card__media">
        ${preview ? `<img src="${preview}" alt="${artwork.title}" loading="lazy">` : ''}
      </div>
      <div class="artwork-card__body">
        <h3 class="artwork-card__title">${artwork.title}</h3>
        <p class="museum-label">${buildMuseumLabel(artwork)}</p>
        <p class="collection-section__meta">${STRINGS.collectionFromPrefix}${artwork.exhibitTitle}</p>
        ${editionLabel ? `<p class="collection-section__meta">${editionLabel}</p>` : ''}
        <div class="artwork-card__footer">
          <span class="exhibit-card__price">${formatCurrency(artwork.priceUsd, currency)}</span>
          <div class="collection-section__actions">
            <button type="button" class="button" data-collection-add="${artwork.id}">${STRINGS.addToBasketCta}</button>
            <button type="button" class="button secondary" data-collection-view="${artwork.exhibitId}">${STRINGS.viewExhibitCta}</button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-collection-add]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', (event) => {
      event.preventDefault();
      const artworkId = node.getAttribute('data-collection-add');
      if (!artworkId) {
        return;
      }
      const item = itemsById.get(artworkId);
      if (item) {
        onAddToCart(item);
      }
    });
  });

  grid.querySelectorAll('[data-collection-view]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', (event) => {
      event.preventDefault();
      const exhibitId = node.getAttribute('data-collection-view');
      if (exhibitId) {
        onViewExhibit(exhibitId);
      }
    });
  });
}
