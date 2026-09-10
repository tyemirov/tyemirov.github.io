// @ts-check
import { validatePublicCatalog } from '../assets/js/catalog.js';
import { initializeSiteFooter } from '../assets/js/footer.js';

const response = await fetch('/data/site.json', { cache: 'no-cache' });
if (!response.ok) throw new Error('Article catalog is unavailable.');
const site = validatePublicCatalog(await response.json());
void initializeSiteFooter({ contact: site.contact, themeAttribute: 'data-theme' });
const items = [...document.querySelectorAll('.article-summary')];
const filters = document.querySelector('#article-filters');
let selected = null;
window.toggleProjectFilter = tag => {
  selected = tag === selected ? null : tag;
  for (const item of items) item.hidden = selected !== null && item.dataset.kicker !== selected && item.dataset.source !== selected;
  for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String((button.dataset.tag || null) === selected));
};
if (filters) {
  for (const tag of [null, ...new Set(items.flatMap(item => [item.dataset.kicker, item.dataset.source]))]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'card-kicker-tag'; button.textContent = tag || 'All'; button.dataset.tag = tag || '';
    button.setAttribute('aria-pressed', String(tag === null));
    button.addEventListener('click', () => window.toggleProjectFilter(tag)); filters.append(button);
  }
}
