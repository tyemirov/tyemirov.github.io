// @ts-check
import { STATUS_GROUPS, STATUS_LABELS } from '../constants.js';
import { formatDateRange, getTodayISO } from '../utils/date.js';

/**
 * @param {import('../types.d.js').ExhibitCatalog | undefined} catalog
 * @returns {import('../types.d.js').Exhibit[]}
 */
export function normalizeCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.exhibits)) {
    return [];
  }
  return catalog.exhibits.filter((exhibit) => Boolean(exhibit && exhibit.id));
}

/**
 * @param {import('../types.d.js').Exhibit} exhibit
 * @param {string} todayISO
 * @returns {'now' | 'upcoming' | 'closed'}
 */
export function deriveStatus(exhibit, todayISO) {
  if (exhibit.start_date <= todayISO && todayISO <= exhibit.end_date) {
    return 'now';
  }
  if (todayISO < exhibit.start_date) {
    return 'upcoming';
  }
  return 'closed';
}

/**
 * @param {import('../types.d.js').Exhibit} exhibit
 * @returns {import('../types.d.js').Artwork | undefined}
 */
export function findPrimaryArtwork(exhibit) {
  if (!Array.isArray(exhibit.artworks)) {
    return undefined;
  }
  return exhibit.artworks.find((artwork) => Boolean(artwork && (artwork.preview || artwork.image)));
}

/**
 * @param {import('../types.d.js').Exhibit} exhibit
 * @param {string} currency
 * @param {string} [todayISO]
 */
export function createExhibitViewModel(exhibit, currency, todayISO = getTodayISO()) {
  const status = deriveStatus(exhibit, todayISO);
  const primaryArtwork = findPrimaryArtwork(exhibit);
  return {
    ...exhibit,
    status,
    statusLabel: STATUS_LABELS[status],
    dateRangeText: formatDateRange(exhibit.start_date, exhibit.end_date),
    primaryArtwork,
    currency
  };
}

/**
 * @param {import('../types.d.js').Exhibit[]} exhibits
 * @param {string} currency
 * @param {string} [todayISO]
 * @returns {import('../types.d.js').GroupedExhibit[]}
 */
export function groupExhibits(exhibits, currency, todayISO = getTodayISO()) {
  const groups = STATUS_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: []
  }));

  exhibits.forEach((exhibit) => {
    const viewModel = createExhibitViewModel(exhibit, currency, todayISO);
    const group = groups.find((entry) => entry.id === viewModel.status);
    if (group) {
      group.items.push(viewModel);
    }
  });

  const sorters = {
    now: (a, b) => b.start_date.localeCompare(a.start_date),
    upcoming: (a, b) => a.start_date.localeCompare(b.start_date),
    closed: (a, b) => b.end_date.localeCompare(a.end_date)
  };

  groups.forEach((group) => {
    const sort = /** @type {(a: import('../types.d.js').Exhibit, b: import('../types.d.js').Exhibit) => number} */ (sorters[group.id] || (() => 0));
    group.items.sort(sort);
  });

  return groups.filter((group) => group.items.length > 0);
}

/**
 * @param {import('../types.d.js').Exhibit[]} exhibits
 * @param {string} id
 * @returns {import('../types.d.js').Exhibit | undefined}
 */
export function findExhibitById(exhibits, id) {
  return exhibits.find((exhibit) => exhibit.id === id);
}
