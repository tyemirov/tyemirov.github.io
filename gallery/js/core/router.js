// @ts-check
import { ROUTES } from '../constants.js';

/**
 * @param {string} hash
 */
export function parseHash(hash) {
  const cleaned = hash.replace(/^#!/, '#').replace(/^#\/*/, '');
  if (!cleaned) {
    return { route: ROUTES.HOME };
  }
  const [segment, param] = cleaned.split('/');
  switch (segment) {
    case ROUTES.CART:
      return { route: ROUTES.CART };
    case ROUTES.ABOUT:
      return { route: ROUTES.ABOUT };
    case 'exhibits':
      if (param) {
        return { route: ROUTES.EXHIBIT, exhibitId: decodeURIComponent(param) };
      }
      break;
    default:
      break;
  }
  return { route: ROUTES.HOME };
}

/**
 * @param {string} route
 * @param {string} [param]
 */
export function navigate(route, param) {
  if (route === ROUTES.HOME) {
    window.location.hash = '#/';
    return;
  }
  if (route === ROUTES.EXHIBIT && param) {
    window.location.hash = `#/exhibits/${encodeURIComponent(param)}`;
    return;
  }
  window.location.hash = `#/${route}`;
}

/**
 * @param {(state: { route: string; exhibitId?: string }) => void} handler
 * @returns {() => void}
 */
export function subscribe(handler) {
  const emit = () => handler(parseHash(window.location.hash));
  const listener = () => {
    emit();
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };
  window.addEventListener('hashchange', listener);
  emit();
  return () => window.removeEventListener('hashchange', listener);
}
