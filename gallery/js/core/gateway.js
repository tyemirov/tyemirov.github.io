// @ts-check
import { DATA_ENDPOINTS, REQUEST_TIMEOUT_MS } from '../constants.js';
import { createLogger } from '../utils/logging.js';

const logger = createLogger('gateway');

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function fetchJSON(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return /** @type {Promise<unknown>} */ (response.json());
}

/**
 * @template T
 * @param {string} url
 * @returns {Promise<T>}
 */
async function load(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const payload = await fetchJSON(url, controller.signal);
    return /** @type {T} */ (payload);
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * @returns {Promise<import('../types.d.js').SiteConfig>}
 */
export function fetchSiteConfig() {
  logger.info('Fetching site configuration');
  return load(DATA_ENDPOINTS.site);
}

/**
 * @returns {Promise<import('../types.d.js').ExhibitCatalog>}
 */
export function fetchExhibitCatalog() {
  logger.info('Fetching exhibit catalog');
  return load(DATA_ENDPOINTS.exhibits);
}
