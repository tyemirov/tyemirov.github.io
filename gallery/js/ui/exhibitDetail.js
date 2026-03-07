// @ts-check
import { STRINGS } from '../constants.js';
import { assertElement, clearChildren, showElement } from '../utils/dom.js';
import { formatCurrency } from '../utils/number.js';

/**
 * @typedef {ReturnType<typeof import('../core/catalog.js').createExhibitViewModel>} ExhibitViewModel
 */

/**
 * @param {string} dimensions
 * @returns {{ width: number; height: number } | undefined}
 */
function parseDimensions(dimensions) {
  const match = dimensions.match(/(\d+)\s*[×x]\s*(\d+)/i);
  if (!match) {
    return undefined;
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (Number.isNaN(width) || Number.isNaN(height)) {
    return undefined;
  }
  return { width, height };
}

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string}
 */
function buildMuseumLabel(artwork) {
  const profile = artwork.profile || 'sRGB';
  return `${artwork.medium} · ${artwork.year} · ${artwork.dimensions} · ${profile}`;
}

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string}
 */
function buildSpecsMarkup(artwork) {
  const facts = [];
  const dimensions = parseDimensions(artwork.dimensions);
  if (dimensions) {
    const totalPixels = dimensions.width * dimensions.height;
    const formatter = new Intl.NumberFormat('en-US');
    facts.push(`Total pixels: ${formatter.format(totalPixels)}`);
  }
  if (artwork.dominantHue) {
    facts.push(`Dominant hue: <span class="swatch" style="color:${artwork.dominantHue}">${artwork.dominantHue}</span>`);
  }
  const profile = artwork.profile || 'sRGB';
  facts.push(`Profile: ${profile}`);
  const fileType = artwork.fileType || 'PNG';
  facts.push(`File type: ${fileType}`);
  if (artwork.editionSize || artwork.editionNumber) {
    const parts = [];
    if (artwork.editionNumber) {
      parts.push(`#${artwork.editionNumber}`);
    }
    if (artwork.editionSize) {
      parts.push(`of ${artwork.editionSize}`);
    }
    facts.push(`Edition: ${parts.join(' ')}`);
  }
  if (artwork.sku) {
    facts.push(`SKU: ${artwork.sku}`);
  }
  if (artwork.specNotes || STRINGS.specsPlayfulFooter) {
    const note = artwork.specNotes || STRINGS.specsPlayfulFooter;
    facts.push(note);
  }

  if (facts.length === 0) {
    return '';
  }

  return `
    <div class="specs">
      <details>
        <summary>${STRINGS.specsToggleLabel}</summary>
        <div class="specs__list">
          ${facts.map((fact) => `<span>${fact}</span>`).join('')}
        </div>
      </details>
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {ExhibitViewModel | undefined} exhibit
 * @param {{
 *  currency: string;
 *  onAddToCart: (payload: { exhibit: ExhibitViewModel; artwork: import('../types.d.js').Artwork }) => void;
 *  onOpenMedia: (source: string, title: string) => void;
 * }} options
 */
export function renderExhibitDetail(container, exhibit, options) {
  assertElement(container);
  const { currency, onAddToCart, onOpenMedia } = options;

  clearChildren(container);

  if (!exhibit) {
    showElement(container);
    container.insertAdjacentHTML('beforeend', '<div class="alert" role="status">This exhibit is not available.</div>');
    return;
  }

  showElement(container);

  const header = document.createElement('article');
  header.className = 'exhibit-summary';
  const badgeClass = `status-badge status-badge--${exhibit.status}`;
  header.innerHTML = `
    <div>
      <span class="${badgeClass}">${exhibit.statusLabel}</span>
      <h2 class="exhibit-summary__title">${exhibit.title}</h2>
      ${exhibit.subtitle ? `<p class="exhibit-summary__meta">${exhibit.subtitle}</p>` : ''}
      <p class="exhibit-summary__meta">${exhibit.dateRangeText}</p>
      ${exhibit.blurb ? `<p class="exhibit-summary__meta">${exhibit.blurb}</p>` : ''}
    </div>
    <a class="link" href="#/">&larr; Back to exhibits</a>
  `;
  container.appendChild(header);

  if (!Array.isArray(exhibit.artworks) || exhibit.artworks.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="alert" role="status">No artworks are attached to this exhibit yet.</div>');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'artwork-grid';

  exhibit.artworks.forEach((artwork) => {
    const card = document.createElement('article');
    card.className = 'artwork-card';
    const preview = artwork.preview || artwork.image;

    card.innerHTML = `
      <div class="artwork-card__media">
        ${preview ? `<button type="button" data-media="${artwork.image || preview}" data-title="${artwork.title}">
          <img src="${preview}" alt="${artwork.title}" loading="lazy">
        </button>` : ''}
      </div>
      <div class="artwork-card__body">
        <h3 class="artwork-card__title">${artwork.title}</h3>
        <p class="museum-label">${buildMuseumLabel(artwork)}</p>
        <div class="artwork-card__footer">
          <span class="exhibit-card__price">${formatCurrency(artwork.priceUsd, currency)}</span>
          <button type="button" class="button" data-artwork-id="${artwork.id}">Add to Basket</button>
        </div>
        ${buildSpecsMarkup(artwork)}
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);

  container.querySelectorAll('[data-artwork-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      const artworkId = target.getAttribute('data-artwork-id');
      if (!artworkId) {
        return;
      }
      const artwork = exhibit.artworks.find((entry) => entry.id === artworkId);
      if (artwork) {
        onAddToCart({ exhibit, artwork });
      }
    });
  });

  container.querySelectorAll('[data-media]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      const source = target.getAttribute('data-media');
      const title = target.getAttribute('data-title') || exhibit.title;
      if (source) {
        onOpenMedia(source, title);
      }
    });
  });
}
