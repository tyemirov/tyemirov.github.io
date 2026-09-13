// @ts-check
import { STORAGE_KEYS } from '../constants.js';

/** @param {import('../types.d.js').GalleryCatalog} catalog */
export function createCartManager(catalog) {
  const readIds = () => {
    const stored = localStorage.getItem(STORAGE_KEYS.cart);
    const parsed = stored === null ? [] : JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some(id => typeof id !== 'string') || new Set(parsed).size !== parsed.length) throw new Error('Read gallery basket: invalid offer references.');
    return parsed;
  };
  let ids = readIds();
  const listeners = new Set();
  const offers = new Map(catalog.artworks.filter(artwork => artwork.offer).map(artwork => [artwork.offer.id, artwork]));
  const notify = () => listeners.forEach(listener => listener());
  const save = next => { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(next)); ids = next; notify(); };
  return {
    items: () => ids.map(id => ({ id, artwork: offers.get(id) })),
    reload() { ids = readIds(); notify(); },
    add(artwork) { const current = readIds(); if (!current.includes(artwork.offer.id)) save([...current, artwork.offer.id]); else { ids = current; notify(); } },
    remove(id) { save(readIds().filter(item => item !== id)); },
    subscribe(listener) { listeners.add(listener); listener(); return () => listeners.delete(listener); },
  };
}
