// @ts-check
import { DATA_ENDPOINTS, REQUEST_TIMEOUT_MS } from '../constants.js';
import { validatePublicCatalog } from '../../../assets/js/catalog.js';

/** @param {AbortSignal} [signal] @returns {Promise<{gallery: import('../types.d.js').GalleryCatalog, catalogDigest: string}>} */
export async function fetchGallerySnapshot(signal) {
  const response = await fetch(DATA_ENDPOINTS.site, { cache: 'no-cache', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Read gallery catalog: HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const catalogDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const site = validatePublicCatalog(JSON.parse(new TextDecoder().decode(bytes)));
  return { gallery: site.gallery, catalogDigest };
}

export async function fetchGallery(signal) { return (await fetchGallerySnapshot(signal)).gallery; }
