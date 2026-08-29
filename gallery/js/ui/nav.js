// @ts-check
import { ROUTES, STRINGS } from '../constants.js';
import { assertElement } from '../utils/dom.js';
import { navigate } from '../core/router.js';

/**
 * @param {HTMLElement} titleElement
 * @param {HTMLElement} subtitleElement
 */
export function updateHeroBranding(titleElement, subtitleElement) {
  titleElement.textContent = STRINGS.heroTitle;
  subtitleElement.textContent = STRINGS.heroSubtitle;
}

/**
 * @param {HTMLElement} navElement
 */
export function wireNavigation(navElement) {
  assertElement(navElement);

  navElement.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      const route = target.getAttribute('data-route');
      const targetId = target.getAttribute('data-target-id');
      if (route === ROUTES.EXHIBIT && targetId) {
        navigate(route, targetId);
      } else if (route) {
        navigate(route);
      }
    });
  });

  return {
    /**
     * @param {string} activeRoute
     */
    setActiveRoute(activeRoute) {
      navElement.querySelectorAll('[data-route]').forEach((anchor) => {
        if (!(anchor instanceof HTMLElement)) {
          return;
        }
        const anchorRoute = anchor.getAttribute('data-route');
        if (!anchorRoute) {
          return;
        }
        const isActive = anchorRoute === activeRoute || (activeRoute === ROUTES.EXHIBIT && anchorRoute === ROUTES.HOME);
        anchor.classList.toggle('active', isActive);
        if (isActive) {
          anchor.setAttribute('aria-current', 'page');
        } else {
          anchor.removeAttribute('aria-current');
        }
      });
    }
  };
}
