// @ts-check
import { STORAGE_KEYS } from '../constants.js';
import { createLogger } from '../utils/logging.js';
import { readJSON, writeJSON } from '../utils/storage.js';

const logger = createLogger('cart');

/**
 * @param {import('../types.d.js').CartItem[]} current
 * @returns {number}
 */
function calculateTotal(current) {
  return current.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0);
}

/**
 * @param {unknown} value
 * @returns {import('../types.d.js').CartItem[]}
 */
function normaliseStoredItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const filtered = value.filter((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const item = /** @type {Record<string, unknown>} */ (entry);
    return (
      typeof item.artworkId === 'string' &&
      typeof item.exhibitId === 'string' &&
      typeof item.exhibitTitle === 'string' &&
      typeof item.title === 'string' &&
      typeof item.priceUsd === 'number' &&
      typeof item.quantity === 'number'
    );
  });
  return /** @type {import('../types.d.js').CartItem[]} */ (filtered);
}

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string | undefined}
 */
function createEditionLabel(artwork) {
  const { editionNumber, editionSize } = artwork;
  if (!editionNumber && !editionSize) {
    return undefined;
  }
  if (editionNumber && editionSize) {
    return `Edition ${editionNumber} of ${editionSize}`;
  }
  if (editionNumber) {
    return `Edition ${editionNumber}`;
  }
  return editionSize ? `Edition of ${editionSize}` : undefined;
}

/**
 * @param {import('../types.d.js').CartItem[]} items
 * @param {(items: import('../types.d.js').CartItem[]) => void} commit
 * @param {import('../types.d.js').Artwork} artwork
 * @param {{ exhibitId: string; exhibitTitle: string }} context
 */
function upsertCartItem(items, commit, artwork, context) {
  const next = items.map((entry) => ({ ...entry }));
  const existing = next.find((entry) => entry.artworkId === artwork.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    next.push({
      artworkId: artwork.id,
      exhibitId: context.exhibitId,
      exhibitTitle: context.exhibitTitle,
      title: artwork.title,
      priceUsd: artwork.priceUsd,
      quantity: 1,
      preview: artwork.preview,
      image: artwork.image,
      editionLabel: createEditionLabel(artwork),
      medium: artwork.medium
    });
  }
  commit(next);
}

/**
 * @param {import('../types.d.js').CartItem[]} items
 * @param {(items: import('../types.d.js').CartItem[]) => void} commit
 * @param {string} artworkId
 */
function removeCartItem(items, commit, artworkId) {
  const next = items.filter((entry) => entry.artworkId !== artworkId);
  commit(next);
}

/**
 * @param {import('../types.d.js').CartItem[]} items
 * @param {(items: import('../types.d.js').CartItem[]) => void} commit
 * @param {string} artworkId
 * @param {number} quantity
 */
function updateQuantity(items, commit, artworkId, quantity) {
  if (Number.isNaN(quantity) || quantity < 1) {
    return;
  }
  const next = items.map((entry) => ({ ...entry }));
  const target = next.find((entry) => entry.artworkId === artworkId);
  if (!target) {
    return;
  }
  target.quantity = quantity;
  commit(next);
}

/**
 * @returns {ReturnType<typeof createCartManager>}
 */
export function createCartManager() {
  let items = normaliseStoredItems(readJSON(STORAGE_KEYS.cart, []));
  const listeners = new Set();

  /**
   * @param {import('../types.d.js').CartItem[]} next
   */
  function commit(next) {
    items = next;
    writeJSON(STORAGE_KEYS.cart, items);
    listeners.forEach((listener) => listener(items));
  }

  return {
    /**
     * @returns {import('../types.d.js').CartItem[]}
     */
    getItems() {
      return items;
    },
    /**
     * @param {(items: import('../types.d.js').CartItem[]) => void} listener
     */
    subscribe(listener) {
      listeners.add(listener);
      listener(items);
      return () => listeners.delete(listener);
    },
    /**
     * @param {import('../types.d.js').Artwork} artwork
     * @param {{ exhibitId: string; exhibitTitle: string }} context
     */
    add(artwork, context) {
      if (!context.exhibitId || !context.exhibitTitle) {
        throw new Error('Cart add context missing exhibit metadata');
      }
      logger.info('Adding artwork to cart', artwork.id, context.exhibitId);
      upsertCartItem(items, commit, artwork, context);
    },
    /**
     * @param {string} artworkId
     */
    remove(artworkId) {
      logger.info('Removing artwork from cart', artworkId);
      removeCartItem(items, commit, artworkId);
    },
    /**
     * @param {string} artworkId
     * @param {number} quantity
     */
    setQuantity(artworkId, quantity) {
      updateQuantity(items, commit, artworkId, quantity);
    },
    clear() {
      commit([]);
    },
    total() {
      return calculateTotal(items);
    }
  };
}

export const cartManager = createCartManager();
