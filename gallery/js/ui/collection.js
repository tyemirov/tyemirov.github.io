// @ts-check
import { orderedArtworks } from '../core/catalog.js';
import { presentationHeader, renderArtworkGrid } from './exhibitDetail.js';

export function renderCollectionDetail(container, collection, catalog, options) {
  container.replaceChildren(presentationHeader(collection.title, collection.introduction));
  renderArtworkGrid(container, orderedArtworks(catalog, collection.artworkIds), options);
}
