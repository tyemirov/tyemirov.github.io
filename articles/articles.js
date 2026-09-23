// @ts-check
import { initializePage } from "/assets/js/navigation.js";
import { validatePublicCatalog } from '../assets/js/catalog.js';
import { initializeSiteFooter } from '../assets/js/footer.js';
import { initializeTopics } from '../assets/js/topics.js';
import { renderArticleIndex } from '../site.js';

export async function mountPage() {

const response = await fetch('/data/site.json', { cache: 'no-cache' });
if (!response.ok) throw new Error('Personal catalog is unavailable.');
const site = validatePublicCatalog(await response.json());
void initializeSiteFooter({ contact: site.contact, themeAttribute: 'data-theme' });
const navigation = document.querySelector('#article-filters');
if (navigation) {
  initializeTopics({ navigation, render: selected => {
    renderArticleIndex(site, selected);
  }});
}
}

initializePage(mountPage);
