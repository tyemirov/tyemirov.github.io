// @ts-check
/** @param {import('../types.d.js').Artwork} artwork */
export function buildMuseumLabel(artwork) {
  return `${artwork.medium} · ${artwork.year} · ${artwork.image.width} × ${artwork.image.height} px`;
}
