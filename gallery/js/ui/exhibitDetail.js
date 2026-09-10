// @ts-check
import { STRINGS, ROUTES } from '../constants.js';
import { element } from '../utils/dom.js';
import { buildMuseumLabel } from '../utils/artwork.js';
import { routeHref } from '../core/router.js';
import { orderedArtworks, deriveStatus } from '../core/catalog.js';
import { formatDateRange } from '../utils/date.js';

/** @param {import('../types.d.js').Artwork} artwork @param {() => void} onAdd */
export function offerDetails(artwork, onAdd) {
  const section = element('section', 'artwork-offer');
  const offer = artwork.offer;
  if (!offer) { section.append(element('p', 'artwork-availability', 'Available to view')); return section; }
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(offer.priceCents / 100);
  section.append(element('p', 'exhibit-card__price', price), element('p', '', offer.license), element('p', '', `${offer.file.label} · ${offer.file.format} · ${offer.file.width} × ${offer.file.height} px`), element('p', '', offer.deliveryTerms));
  const add = element('button', 'button', STRINGS.addToBasketCta); add.type = 'button'; add.addEventListener('click', onAdd); section.append(add);
  return section;
}

/** @param {import('../types.d.js').Artwork} artwork @param {{onOpen: () => void, onAdd: () => void}} options */
export function artworkCard(artwork, options) {
  const card = element('article', 'artwork-card');
  card.dataset.artworkId = artwork.id;
  const media = element('div', 'artwork-card__media');
  const open = element('button'); open.type = 'button'; open.dataset.media = artwork.id; open.setAttribute('aria-label', `View ${artwork.title}`);
  const image = element('img'); image.src = artwork.image.cardUrl; image.alt = artwork.alt; image.loading = 'lazy';
  image.width = artwork.image.width; image.height = artwork.image.height;
  open.append(image); open.addEventListener('click', () => { open.focus({ preventScroll: true }); options.onOpen(); }); media.append(open);
  const body = element('div', 'artwork-card__body');
  const title = element('h3', 'artwork-card__title');
  const link = element('a', 'link', artwork.title); link.href = routeHref(ROUTES.ARTWORK, artwork.id); title.append(link);
  body.append(title, element('p', 'museum-label', buildMuseumLabel(artwork)), element('p', '', artwork.description));
  body.append(offerDetails(artwork, options.onAdd));
  const details = element('details', 'specs'); details.append(element('summary', '', STRINGS.specsToggleLabel), element('p', 'specs__list', `${artwork.image.format} · ${new Intl.NumberFormat('en-US').format(artwork.image.width * artwork.image.height)} pixels`));
  body.append(details); card.append(media, body); return card;
}

/** @param {HTMLElement} container @param {import('../types.d.js').Artwork[]} artworks @param {{onOpen: (items: import('../types.d.js').Artwork[], index: number) => void, onAdd: (artwork: import('../types.d.js').Artwork) => void}} options */
export function renderArtworkGrid(container, artworks, options) {
  const grid = element('div', 'artwork-grid');
  artworks.forEach((artwork, index) => grid.append(artworkCard(artwork, { onOpen: () => options.onOpen(artworks, index), onAdd: () => options.onAdd(artwork) })));
  container.append(grid);
}

export function presentationHeader(title, introduction) {
  const header = element('header', 'exhibit-summary');
  const copy = element('div'); copy.append(element('h2', 'exhibit-summary__title', title), element('p', 'exhibit-summary__meta', introduction));
  const back = element('a', 'link', '← Back to exhibits'); back.href = routeHref(ROUTES.HOME);
  header.append(copy, back); return header;
}

export function renderExhibitDetail(container, exhibit, catalog, options) {
  container.replaceChildren(presentationHeader(exhibit.title, exhibit.introduction));
  const header = container.firstElementChild.firstElementChild;
  header.append(element('p', 'exhibit-summary__meta', exhibit.subtitle), element('p', 'exhibit-summary__meta', formatDateRange(exhibit.startDate, exhibit.endDate)));
  const state = deriveStatus(exhibit, new Date().toISOString().slice(0, 10));
  header.append(element('span', `status-badge status-badge--${state}`, { now: 'Now Showing', upcoming: 'Upcoming', closed: 'Past Exhibits' }[state]));
  const sequence = orderedArtworks(catalog, exhibit.sections.flatMap(section => section.artworkIds));
  for (const section of exhibit.sections) {
    const region = element('section', 'exhibit-section'); region.append(element('h3', 'exhibit-group__title', section.title));
    const items = orderedArtworks(catalog, section.artworkIds);
    renderArtworkGrid(region, items, { ...options, onOpen: (items, index) => options.onOpen(sequence, sequence.indexOf(items[index])) });
    container.append(region);
  }
}
