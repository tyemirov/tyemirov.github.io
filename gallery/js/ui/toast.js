// @ts-check
import { TOAST_TIMEOUT_MS } from '../constants.js';
import { assertElement } from '../utils/dom.js';

/**
 * @param {HTMLElement | null} element
 * @param {{ duration?: number }} [options]
 */
export function createToast(element, options = {}) {
  if (!element) {
    return {
      show: () => undefined,
      hide: () => undefined
    };
  }

  assertElement(element);
  const duration = options.duration ?? TOAST_TIMEOUT_MS;
  let timer = 0;

  function hide() {
    window.clearTimeout(timer);
    element.classList.remove('is-visible');
    element.classList.add('is-hidden');
  }

  return {
    /**
     * @param {string} message
     */
    show(message) {
      window.clearTimeout(timer);
      element.textContent = message;
      element.classList.remove('is-hidden');
      element.classList.add('is-visible');
      timer = window.setTimeout(() => {
        hide();
      }, duration);
    },
    hide
  };
}
