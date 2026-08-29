// @ts-check
import { STRINGS } from '../constants.js';
import { formatCurrency } from '../utils/number.js';
import { assertElement, clearChildren } from '../utils/dom.js';

/**
 * @param {import('../types.d.js').GroupedExhibit[]} groups
 * @param {{ container: HTMLElement; currency: string; onOpenExhibit: (exhibitId: string) => void; }} options
 */
export function renderExhibitGroups(groups, options) {
  const { container, currency, onOpenExhibit } = options;
  assertElement(container);
  clearChildren(container);

  if (groups.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="alert" role="status">
        <h2>${STRINGS.emptyStateTitle}</h2>
        <p>${STRINGS.emptyStateBody}</p>
      </div>`
    );
    return;
  }

  groups.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'exhibit-group';
    section.setAttribute('aria-labelledby', `group-${group.id}`);

    section.innerHTML = `
      <div class="exhibit-group__header">
        <h2 id="group-${group.id}" class="exhibit-group__title">${group.title}</h2>
        <span class="gallery-nav__badge" aria-label="${group.items.length} exhibits">${group.items.length}</span>
      </div>
      <div class="exhibit-grid" role="list"></div>
    `;

    const grid = /** @type {HTMLElement} */ (section.querySelector('.exhibit-grid'));

    group.items.forEach((exhibit) => {
      const column = document.createElement('article');
      column.className = 'exhibit-card';
      column.setAttribute('role', 'listitem');

      const primary = exhibit.primaryArtwork;
      const previewSrc = primary?.preview || primary?.image;
      const previewAlt = primary ? `${exhibit.title} — ${primary.title}` : `${exhibit.title} preview`;
      const priceLabel = primary ? formatCurrency(primary.priceUsd, currency) : STRINGS.priceOnRequest;
      const badgeClass = `status-badge status-badge--${exhibit.status}`;

      column.innerHTML = `
        <figure class="exhibit-card__media">
          ${previewSrc ? `<img src="${previewSrc}" alt="${previewAlt}" loading="lazy">` : ''}
          <span class="${badgeClass}">${exhibit.statusLabel}</span>
        </figure>
        <div class="exhibit-card__body">
          <h3 class="exhibit-card__title">${exhibit.title}</h3>
          ${exhibit.subtitle ? `<p class="exhibit-card__subtitle">${exhibit.subtitle}</p>` : ''}
          <p class="exhibit-card__meta">${exhibit.dateRangeText}</p>
          ${exhibit.blurb ? `<p class="exhibit-card__blurb">${exhibit.blurb}</p>` : ''}
          <div class="exhibit-card__footer">
            <span class="exhibit-card__price">${priceLabel}</span>
            <button type="button" class="button secondary" data-exhibit-id="${exhibit.id}">${STRINGS.viewExhibitCta}</button>
          </div>
        </div>
      `;

      grid.appendChild(column);
    });

    container.appendChild(section);
  });

  container.querySelectorAll('[data-exhibit-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const target = /** @type {HTMLElement} */ (event.currentTarget);
      const exhibitId = target.getAttribute('data-exhibit-id');
      if (exhibitId) {
        onOpenExhibit(exhibitId);
      }
    });
  });
}
