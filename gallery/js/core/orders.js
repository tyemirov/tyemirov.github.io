// @ts-check
import { routes } from '../../../assets/js/generated/routes.js';
import { galleryOrder, galleryOrderCreation, galleryDownloadCreation, galleryError, galleryOrderInput, siteRuntime } from '../../../assets/js/generated/validators.js';
import { REQUEST_TIMEOUT_MS } from '../constants.js';

export const ORDER_CONFIG_PATH = '/config-site.json';
export const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const FORMATS = { PNG: ['image/png', 'png'], JPEG: ['image/jpeg', 'jpg'], WebP: ['image/webp', 'webp'] };

function invalid() { throw new OrderClientError('The gallery returned an invalid response. Try again later.'); }
function text(value) { if (typeof value !== 'string' || !value.trim() || value.length > 20000) invalid(); }
function pattern(value, expression) { if (typeof value !== 'string' || !expression.test(value)) invalid(); }

/** @typedef {import('../types.d.js').BuyerOrder} BuyerOrder */
/** @param {unknown} value @param {string} expectedID @returns {BuyerOrder} */
function validateOrder(value, expectedID) {
  if (!galleryOrder(value) || value.id !== expectedID) invalid();
  const order = /** @type {BuyerOrder} */ (value);
  const offers = new Map();
  for (const item of order.items) {
    const offer = item.offer;
    if (offer.currency !== order.currency || offers.has(offer.id)) invalid();
    offers.set(offer.id, offer);
  }
  if (order.items.reduce((sum, item) => sum + item.offer.priceCents, 0) !== order.totalCents) invalid();
  if (!Array.isArray(order.entitlements) || order.entitlements.length > order.items.length) invalid();
  const entitlements = new Set();
  for (const entitlement of order.entitlements) {
    if (entitlements.has(entitlement.offerId) || !offers.has(entitlement.offerId) || offers.get(entitlement.offerId).revision !== entitlement.revision || !['active','revoked'].includes(entitlement.status)) invalid();
    entitlements.add(entitlement.offerId);
  }
  return order;
}

export class OrderClientError extends Error {}

export class OrderAPIError extends OrderClientError {
  constructor(status, code) {
    const messages = {
      401: 'The order ID or access code is incorrect. Check your receipt and try again.',
      403: 'This purchase does not authorize that download. Check the order status.',
      409: 'This order cannot complete that action. Check the current payment status.',
      410: 'The download link expired. Select Download original to request a new link.',
      429: 'Too many requests. Wait a moment before trying again.',
      422: 'Some selected works are no longer available. Return to the basket and review your selection.',
    };
    super(messages[status] || 'The gallery service is unavailable. Try again later.');
    this.status = status; this.code = code;
  }
}

/** Construct the split-origin buyer API from its public configuration. */
export async function createOrderClient(signal) {
  const response = await fetch(ORDER_CONFIG_PATH, { cache:'no-store', credentials:'omit', redirect:'error', signal:AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) });
  if (!response.ok) throw new OrderClientError('Order access is unavailable. Reload the page to try again.');
  const origin = validateOrderConfig(await response.json());
  async function request(path, secret, options = {}) {
    const result = await fetch(origin + path, { ...options, headers:{ Accept:'application/json', ...options.headers, ...(options.body ? {'Content-Type':'application/json'} : {}), ...(secret === undefined ? {} : {Authorization:`Bearer ${secret}`}) }, credentials:'omit', cache:'no-store', redirect:'error', signal:AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) });
    if (!result.ok) {
      const error = await result.json(); if(!galleryError(error)) invalid();
      throw new OrderAPIError(result.status, error.code);
    }
    return result;
  }
  function access(id, secret, operation='readOrder') { pattern(id, ORDER_ID); pattern(secret, SECRET); return routes.gallery[operation].path.replace('{orderId}',id); }
  return Object.freeze({
    async create(offerIds, email, key, catalogDigest) {
      if (!galleryOrderInput({offerIds,email,catalogDigest})) invalid();
      pattern(key, ORDER_ID);
      const created = await (await request(routes.gallery.createOrder.path, undefined, {method:'POST', headers:{'Idempotency-Key':key}, body:JSON.stringify({offerIds,email,catalogDigest})})).json();
      if(!galleryOrderCreation(created)) invalid();
      const order = validateOrder(created.order, created.order.id);
      if (order.email !== email.trim().toLowerCase() || order.items.length !== offerIds.length || order.items.some(item => !offerIds.includes(item.offer.id))) invalid();
      return {order, accessSecret:created.accessSecret};
    },
    async read(id, secret) { return validateOrder(await (await request(access(id, secret), secret)).json(), id); },
    async capture(id, secret) { return validateOrder(await (await request(access(id, secret, 'createCapture'), secret, {method:'POST', body:'{}'})).json(), id); },
    async cancel(id, secret) { return validateOrder(await (await request(access(id, secret), secret, {method:'PATCH', body:JSON.stringify({status:'cancelled'})})).json(), id); },
    /** @param {string} id @param {string} secret @param {import('../types.d.js').SaleOffer} offer */
    async download(id, secret, offer) {
      const grant = await (await request(access(id, secret, 'createDownloadLink'), secret, {method:'POST', body:JSON.stringify({offerId:offer.id})})).json();
      if(!galleryDownloadCreation(grant)) invalid();
      const file = grant.download;
      if (file.offerId !== offer.id || file.revision !== offer.revision || file.href !== routes.gallery.readDownload.path.replace('{downloadId}',file.id) || typeof file.expiresAt !== 'string' || !Number.isFinite(Date.parse(file.expiresAt))) invalid();
      const response = await request(file.href, grant.accessSecret, {headers:{Accept:FORMATS[offer.file.format][0]}});
      if (response.headers.get('Content-Type') !== FORMATS[offer.file.format][0]) invalid();
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > 25*1024*1024) invalid();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2,'0')).join('');
      if (digest !== offer.revision) throw new OrderClientError('The downloaded file did not match your purchased revision. Try again later.');
      return { blob:new Blob([bytes], {type:FORMATS[offer.file.format][0]}), filename:`${offer.id}-${offer.revision}.${FORMATS[offer.file.format][1]}` };
    },
  });
}

/** Validate the public buyer API configuration at browser and artifact boundaries.
 * @param {unknown} value
 * @returns {string}
 */
export function validateOrderConfig(value) {
  if(!siteRuntime(value)) invalid();
  const config = /** @type {{apiOrigin:string}} */ (value);
  const origin = new URL(config.apiOrigin);
  if (origin.origin !== config.apiOrigin) invalid();
  return origin.origin;
}
