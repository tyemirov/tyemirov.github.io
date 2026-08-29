// @ts-check
import { STRINGS } from '../constants.js';

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string}
 */
export function buildMuseumLabel(artwork) {
  const medium = artwork.medium || STRINGS.artworksLabel;
  const year = artwork.year || '';
  const dimensions = artwork.dimensions || '';
  const profile = artwork.profile || 'sRGB';
  const parts = [medium];

  if (year) {
    parts.push(year);
  }

  if (dimensions) {
    parts.push(dimensions);
  }

  parts.push(profile);

  return parts.join(' · ');
}
