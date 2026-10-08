// @ts-check
import { STATUS_GROUPS } from '../constants.js';
import { galleryCatalog } from '../../../assets/js/generated/validators.js';
import { validateGalleryReferences } from '../../../assets/js/catalog.js';

/** @returns {import('../types.d.js').GalleryCatalog} */
export function validateGallery(value) {
  if (!galleryCatalog(value)) throw new Error(`Validate gallery: ${JSON.stringify(galleryCatalog.errors)}`);
  validateGalleryReferences(value);
  return value;
}

/** @param {import('../types.d.js').Exhibit} exhibit @param {string} today */
export function deriveStatus(exhibit, today) {
  return today < exhibit.startDate ? 'upcoming' : today > exhibit.endDate ? 'closed' : 'now';
}

/** @param {import('../types.d.js').GalleryCatalog} catalog @param {string} today */
export function groupExhibits(catalog, today = new Date().toISOString().slice(0, 10)) {
  return STATUS_GROUPS.map(group => ({ ...group, items: catalog.exhibits.filter(exhibit => deriveStatus(exhibit, today) === group.id).sort((a, b) => group.id === 'upcoming' ? a.startDate.localeCompare(b.startDate) : group.id === 'now' ? b.startDate.localeCompare(a.startDate) : b.endDate.localeCompare(a.endDate)) })).filter(group => group.items.length);
}

/** @param {import('../types.d.js').GalleryCatalog} catalog @param {string[]} ids */
export function orderedArtworks(catalog, ids) {
  const byId = new Map(catalog.artworks.map(artwork => [artwork.id, artwork]));
  return ids.map(id => byId.get(id));
}
