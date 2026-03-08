// @ts-check
import { assertElement } from '../utils/dom.js';

/**
 * @param {HTMLElement} navElement
 * @param {{
 *  onSelectStatus: (status: 'now' | 'upcoming') => void;
 *  onSelectCollection: () => void;
 * }} handlers
 */
export function initSectionNav(navElement, handlers) {
  assertElement(navElement);
  const buttons = new Map();
  /** @type {{ now: boolean; upcoming: boolean }} */
  const availability = { now: true, upcoming: true };

  navElement.querySelectorAll('[data-section-filter]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const filter = node.getAttribute('data-section-filter');
    if (filter) {
      buttons.set(filter, node);
    }
  });

  /** @type {'now' | 'upcoming' | 'collection'} */
  let activeFilter = 'collection';

  /**
   * @param {'now' | 'upcoming' | 'collection'} filter
   * @param {boolean} [force]
   */
  function setActive(filter, force = false) {
    let target = filter;
    const unavailableNow = target === 'now' && !availability.now;
    const unavailableUpcoming = target === 'upcoming' && !availability.upcoming;

    if (unavailableNow || unavailableUpcoming) {
      if (!force) {
        return;
      }
      target = 'collection';
    }

    if (!force && activeFilter === target) {
      return;
    }

    buttons.forEach((button, key) => {
      const isActive = key === target;
      button.classList.toggle('is-active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    activeFilter = target;
  }

  /**
   * @param {'now' | 'upcoming'} filter
   * @param {boolean} available
   */
  function setAvailability(filter, available) {
    const button = buttons.get(filter);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = !available;

    if (!available) {
      button.setAttribute('aria-disabled', 'true');
      button.classList.remove('is-active');
      button.removeAttribute('aria-current');
    } else {
      button.removeAttribute('aria-disabled');
    }
  }

  buttons.forEach((button, key) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (button.disabled) {
        return;
      }

      if (key === 'collection') {
        setActive('collection');
        handlers.onSelectCollection();
        return;
      }

      const status = key === 'now' ? 'now' : 'upcoming';
      setActive(status);
      handlers.onSelectStatus(status);
    });
  });

  return {
    /**
     * @param {{ active: 'now' | 'upcoming' | 'collection'; hasNow: boolean; hasUpcoming: boolean }} state
     */
    setState(state) {
      availability.now = state.hasNow;
      availability.upcoming = state.hasUpcoming;
      setAvailability('now', state.hasNow);
      setAvailability('upcoming', state.hasUpcoming);

      let desired = state.active;
      if (desired === 'now' && !state.hasNow) {
        desired = state.hasUpcoming ? 'upcoming' : 'collection';
      }
      if (desired === 'upcoming' && !state.hasUpcoming) {
        desired = state.hasNow ? 'now' : 'collection';
      }

      setActive(desired, true);
    }
  };
}
