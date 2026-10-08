// @ts-check
import { ROUTES } from '../constants.js';

/** @param {string} path */
export function parsePath(path) {
  if (path === '/gallery/') return { route: ROUTES.HOME };
  const match = /^\/gallery\/(exhibits|collections|artworks)\/([a-z0-9][a-z0-9-]{0,99})\/$/.exec(path);
  if (match) return { route: match[1], id: match[2] };
  if (path === '/gallery/about/') return { route: ROUTES.ABOUT };
  if (path === '/gallery/cart/') return { route: ROUTES.CART };
  return { route: ROUTES.NOT_FOUND };
}

/** @param {string} route @param {string} [id] */
export function routeHref(route, id) { return route === ROUTES.HOME ? '/gallery/' : `/gallery/${route}${id ? `/${encodeURIComponent(id)}` : ''}/`; }

/** @param {(state: {route: string, id?: string}) => void} handler */
export function subscribe(handler) {
  const listener = () => { handler(parsePath(location.pathname)); window.scrollTo({ top: 0 }); };
  window.addEventListener('popstate', listener);
  handler(parsePath(location.pathname));
  return () => window.removeEventListener('popstate', listener);
}
