// @ts-check
import { element } from '../utils/dom.js';
import { routeHref } from '../core/router.js';
import { ROUTES } from '../constants.js';
import { groupExhibits } from '../core/catalog.js';
import { formatDateRange } from '../utils/date.js';

function presentationCard(presentation, artwork, route) {
  const card = element('article', 'exhibit-card');
  const link = element('a', 'exhibit-card__media'); link.href = routeHref(route, presentation.id); link.setAttribute('aria-label', presentation.title);
  const image = element('img'); image.src = artwork.image.cardUrl; image.alt = ''; image.loading = 'lazy';
  image.width = artwork.image.width; image.height = artwork.image.height; image.style.objectPosition = presentation.coverPosition.map(n => `${n}%`).join(' ');
  link.append(image);
  const body = element('div', 'exhibit-card__body'); body.append(element('h3', 'exhibit-card__title', presentation.title), element('p', 'exhibit-card__blurb', presentation.introduction));
  if (route === ROUTES.EXHIBIT) body.append(element('p', 'exhibit-summary__meta', formatDateRange(presentation.startDate, presentation.endDate)));
  card.append(link, body); return card;
}

/** @param {HTMLElement} container @param {import('../types.d.js').GalleryCatalog} catalog */
export function renderExhibitGroups(container, catalog) {
  const artworks = new Map(catalog.artworks.map(artwork => [artwork.id, artwork]));
  const groups = groupExhibits(catalog);
  const collections = { id: 'collections', title: 'Collections', items: catalog.collections };
  const sections = [...groups.filter(group => group.id !== 'closed'), collections, ...groups.filter(group => group.id === 'closed')];
  container.replaceChildren();
  for (const group of sections.filter(group => group.items.length)) {
    const section = element('section', 'exhibit-group'); section.id = `group-${group.id}`;
    const heading = element('h2', 'exhibit-group__title', group.title); heading.id = `${section.id}-title`; section.setAttribute('aria-labelledby', heading.id);
    const grid = element('div', 'exhibit-grid');
    for (const item of group.items) grid.append(presentationCard(item, artworks.get(item.coverArtworkId), group.id === 'collections' ? ROUTES.COLLECTION : ROUTES.EXHIBIT));
    section.append(heading, grid); container.append(section);
  }
  if (!container.children.length) container.append(element('p', 'alert', 'The gallery has no published collections or exhibits.'));
}
