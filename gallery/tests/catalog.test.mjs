// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flattenCollectionArtworks, partitionExhibits } from '../js/core/catalog.js';

const referenceCurrency = 'USD';
const referenceTodayISO = '2025-06-15';

test('partitionExhibits splits and sorts now, upcoming, and closed exhibits', () => {
  const exhibits = [
    {
      id: 'closed-archive',
      title: 'Closed Archive',
      start_date: '2024-01-01',
      end_date: '2024-01-15',
      artworks: []
    },
    {
      id: 'upcoming-solo',
      title: 'Upcoming Solo',
      start_date: '2025-07-20',
      end_date: '2025-08-20',
      artworks: []
    },
    {
      id: 'now-latest',
      title: 'Now Latest',
      start_date: '2025-05-20',
      end_date: '2025-06-30',
      artworks: []
    },
    {
      id: 'now-earlier',
      title: 'Now Earlier',
      start_date: '2025-05-01',
      end_date: '2025-06-20',
      artworks: []
    }
  ];

  const partitions = partitionExhibits(exhibits, referenceCurrency, referenceTodayISO);

  assert.deepStrictEqual(
    partitions.now.map((exhibit) => exhibit.id),
    ['now-latest', 'now-earlier']
  );
  assert.deepStrictEqual(
    partitions.upcoming.map((exhibit) => exhibit.id),
    ['upcoming-solo']
  );
  assert.deepStrictEqual(
    partitions.closed.map((exhibit) => exhibit.id),
    ['closed-archive']
  );
  assert.deepStrictEqual(
    partitions.active.map((exhibit) => exhibit.id),
    ['now-latest', 'now-earlier', 'upcoming-solo']
  );
});

test('flattenCollectionArtworks attaches exhibit context to each artwork', () => {
  const exhibits = [
    {
      id: 'the-third-act',
      title: 'The Third Act',
      start_date: '2025-10-01',
      end_date: '2025-10-18',
      artworks: [
        {
          id: 'triptych-01',
          title: 'Triptych No.1',
          priceUsd: 240,
          dimensions: '1536×1024 px',
          preview: 'images/previews/third-act-01-preview.jpg',
          image: 'images/full/third-act-01.png',
          medium: 'Digital pigment print',
          year: '2025'
        }
      ]
    }
  ];

  const collection = flattenCollectionArtworks(exhibits);

  assert.strictEqual(collection.length, 1);
  assert.strictEqual(collection[0].id, 'triptych-01');
  assert.strictEqual(collection[0].exhibitId, 'the-third-act');
  assert.strictEqual(collection[0].exhibitTitle, 'The Third Act');
});
