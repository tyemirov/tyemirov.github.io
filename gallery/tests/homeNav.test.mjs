// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { initSectionNav } from '../js/ui/homeNav.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tyemirov.net/gallery/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.Node = dom.window.Node;

test('initSectionNav updates active state and disabled availability', () => {
  const nav = document.createElement('nav');
  nav.innerHTML = `
    <button type="button" data-section-filter="now">Now</button>
    <button type="button" data-section-filter="upcoming">Upcoming</button>
    <button type="button" data-section-filter="collection">Collection</button>
  `;

  const events = [];
  const controls = initSectionNav(nav, {
    onSelectStatus: (status) => {
      events.push(status);
    },
    onSelectCollection: () => {
      events.push('collection');
    }
  });

  controls.setState({ active: 'now', hasNow: true, hasUpcoming: false });

  const nowButton = /** @type {HTMLButtonElement} */ (nav.querySelector('[data-section-filter="now"]'));
  const upcomingButton = /** @type {HTMLButtonElement} */ (nav.querySelector('[data-section-filter="upcoming"]'));
  const collectionButton = /** @type {HTMLButtonElement} */ (nav.querySelector('[data-section-filter="collection"]'));

  assert.strictEqual(nowButton.getAttribute('aria-current'), 'true');
  assert.strictEqual(upcomingButton.disabled, true);

  collectionButton.click();
  nowButton.click();

  assert.deepStrictEqual(events, ['collection', 'now']);
});

test('cleanup jsdom for home nav tests', () => {
  dom.window.close();
});
