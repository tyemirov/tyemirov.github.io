// @ts-check
import { validatePublicCatalog } from '../assets/js/catalog.js';
import { initializeSiteFooter } from '../assets/js/footer.js';
import { initializeTopics } from '../assets/js/topics.js';

const response = await fetch('/data/site.json', { cache: 'no-cache' });
if (!response.ok) throw new Error('Personal catalog is unavailable.');
const site = validatePublicCatalog(await response.json());
void initializeSiteFooter({ contact: site.contact, themeAttribute: 'data-theme' });
const items = [...document.querySelectorAll('.article-summary')];
const navigation = document.querySelector('#article-filters');
if (navigation) {
  const heading = document.querySelector('h1');
  const title = heading.textContent;
  const empty = document.querySelector('.topic-empty');
  initializeTopics({ navigation, render: selected => {
    for (const item of items) item.hidden = selected !== null && item.dataset.kicker !== selected;
    heading.textContent = selected || title;
    empty.hidden = items.some(item => !item.hidden);
  }});
}
