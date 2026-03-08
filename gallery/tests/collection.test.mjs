// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderCollectionSection } from '../js/ui/collection.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tyemirov.net/gallery/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.Node = dom.window.Node;

test('renderCollectionSection renders cards and wires actions', () => {
  const container = document.createElement('section');
  const added = [];
  const viewed = [];
  const artworks = [
    {
      id: 'triptych-01',
      title: 'Triptych No.1',
      exhibitId: 'the-third-act',
      exhibitTitle: 'The Third Act',
      priceUsd: 240,
      dimensions: '1536×1024 px',
      preview: 'images/previews/third-act-01-preview.jpg',
      image: 'images/full/third-act-01.png',
      medium: 'Digital pigment print',
      year: '2025',
      editionSize: 25,
      editionNumber: 1
    }
  ];

  renderCollectionSection(container, artworks, {
    currency: 'USD',
    onAddToCart: (artwork) => {
      added.push(artwork.id);
    },
    onViewExhibit: (exhibitId) => {
      viewed.push(exhibitId);
    }
  });

  assert.strictEqual(container.querySelectorAll('.artwork-card').length, 1);
  assert.match(container.textContent ?? '', /Collection/);
  assert.match(container.textContent ?? '', /The Third Act/);

  const addButton = /** @type {HTMLButtonElement | null} */ (container.querySelector('[data-collection-add]'));
  const viewButton = /** @type {HTMLButtonElement | null} */ (container.querySelector('[data-collection-view]'));

  assert.ok(addButton);
  assert.ok(viewButton);

  addButton?.click();
  viewButton?.click();

  assert.deepStrictEqual(added, ['triptych-01']);
  assert.deepStrictEqual(viewed, ['the-third-act']);
});

test('renderCollectionSection shows an empty state when no artworks are available', () => {
  const container = document.createElement('section');

  renderCollectionSection(container, [], {
    currency: 'USD',
    onAddToCart: () => {},
    onViewExhibit: () => {}
  });

  assert.ok(container.querySelector('.collection-section__empty'));
});

test('cleanup jsdom for collection tests', () => {
  dom.window.close();
});
