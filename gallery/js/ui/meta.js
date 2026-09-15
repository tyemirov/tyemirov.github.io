// @ts-check
import { routeHref } from '../core/router.js';
import { ROUTES } from '../constants.js';

/** @param {import('../types.d.js').GalleryCatalog} catalog @param {import('../types.d.js').Artwork} artwork */
export function artworkMetadata(catalog, artwork) {
  const url = new URL(routeHref(ROUTES.ARTWORK, artwork.id), document.querySelector('link[rel=canonical]').href).href;
  const record = { '@type': 'VisualArtwork', '@id': url, url, name: artwork.title, description: artwork.description, image: new URL(artwork.image.lightboxUrl, url).href, artMedium: artwork.medium, dateCreated: artwork.year };
  if (artwork.offer) Object.assign(record, { offers: { '@type': 'Offer', price: (artwork.offer.priceCents / 100).toFixed(2), priceCurrency: artwork.offer.currency, availability: 'https://schema.org/InStock' } });
  return record;
}

export function applyMetadata(catalog, route, presentation = null) {
  const url = new URL(routeHref(route.route, route.id), document.querySelector('link[rel=canonical]').href).href;
  const title = presentation ? `${presentation.title} · ${catalog.brand}` : catalog.brand;
  const description = presentation ? (route.route === ROUTES.ARTWORK ? presentation.description : presentation.introduction) : catalog.description;
  document.title = title;
  for (const [selector, content] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', url], ['meta[name="twitter:title"]', title], ['meta[name="twitter:description"]', description]]) document.querySelector(selector).setAttribute('content', content);
  document.querySelector('link[rel="canonical"]').setAttribute('href', url);
  const cover = presentation ? (route.route === ROUTES.ARTWORK ? presentation : catalog.artworks.find(artwork => artwork.id === presentation.coverArtworkId)) : catalog.artworks[0];
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) document.querySelector(selector).setAttribute('content', cover ? new URL(cover.image.lightboxUrl, url).href : '');
  let record = { '@type': 'ArtGallery', name: catalog.brand, description, url };
  if (presentation && route.route === ROUTES.ARTWORK) record = artworkMetadata(catalog, presentation);
  if (presentation && route.route === ROUTES.EXHIBIT) record = { '@type': 'ExhibitionEvent', name: presentation.title, description, url, startDate: presentation.startDate, endDate: presentation.endDate, location: { '@type': 'VirtualLocation', url }, workFeatured: presentation.sections.flatMap(section => section.artworkIds).map(id => artworkMetadata(catalog, catalog.artworks.find(artwork => artwork.id === id))) };
  if (presentation && route.route === ROUTES.COLLECTION) record = { '@type': 'ItemList', name: presentation.title, description, url, itemListElement: presentation.artworkIds.map((id, index) => ({ '@type': 'ListItem', position: index + 1, item: artworkMetadata(catalog, catalog.artworks.find(artwork => artwork.id === id)) })) };
  document.querySelector('#structured-data').textContent = JSON.stringify({ '@context': 'https://schema.org', ...record });
}
