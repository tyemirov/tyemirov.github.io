// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderExhibitCarousel } from '../js/ui/carousel.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tyemirov.net/gallery/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.Node = dom.window.Node;

/**
 * @param {string} id
 * @param {'now' | 'upcoming'} status
 * @returns {ReturnType<typeof import('../js/core/catalog.js').createExhibitViewModel>}
 */
function createSlide(id, status) {
  return /** @type {any} */ ({
    id,
    title: `Exhibit ${id}`,
    subtitle: 'A study in chromatic restraint',
    blurb: 'Brief curatorial text.',
    start_date: '2025-05-01',
    end_date: '2025-06-30',
    dateRangeText: 'May 1, 2025 – June 30, 2025',
    status,
    statusLabel: status === 'now' ? 'Now Showing' : 'Upcoming'
  });
}

test('renderExhibitCarousel renders slides, navigation, and exposes goTo', () => {
  const container = document.createElement('div');
  const openedExhibits = [];
  const slideChanges = [];
  const carousel = renderExhibitCarousel(
    container,
    [createSlide('alpha', 'now'), createSlide('beta', 'upcoming')],
    {
      onOpenExhibit: (exhibitId) => {
        openedExhibits.push(exhibitId);
      },
      onSlideChange: (index, exhibit) => {
        slideChanges.push({ index, id: exhibit?.id });
      }
    }
  );

  assert.ok(carousel, 'Expected carousel API to be returned.');
  assert.strictEqual(container.querySelectorAll('.carousel__slide').length, 2);
  assert.deepStrictEqual(slideChanges[0], { index: 0, id: 'alpha' });

  carousel.goTo(1);

  const slides = container.querySelectorAll('.carousel__slide');
  assert.strictEqual(slides[0].getAttribute('aria-hidden'), 'true');
  assert.strictEqual(slides[1].getAttribute('aria-hidden'), 'false');
  assert.deepStrictEqual(slideChanges.at(-1), { index: 1, id: 'beta' });

  const cta = /** @type {HTMLElement | null} */ (container.querySelector('[data-carousel-open="beta"]'));
  assert.ok(cta, 'Expected exhibit CTA link to exist.');
  cta?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepStrictEqual(openedExhibits, ['beta']);
});

test('cleanup jsdom for carousel tests', () => {
  dom.window.close();
});
