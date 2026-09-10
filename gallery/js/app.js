// @ts-check
import { fetchGallery } from './core/gateway.js';
import { createCartManager } from './core/cart.js';
import { subscribe, routeHref } from './core/router.js';
import { ROUTES, STRINGS, STORAGE_KEYS } from './constants.js';
import { renderExhibitGroups } from './ui/exhibitList.js';
import { renderExhibitDetail, renderArtworkGrid, presentationHeader } from './ui/exhibitDetail.js';
import { renderCollectionDetail } from './ui/collection.js';
import { renderCartView } from './ui/cartView.js';
import { initLightbox } from './ui/lightbox.js';
import { applyMetadata } from './ui/meta.js';
import { element, showElement, hideElement } from './utils/dom.js';

const views = {
  home: document.getElementById('home-view'),
  detail: document.getElementById('exhibit-view'),
  about: document.getElementById('about-view'),
  cart: document.getElementById('cart-view'),
};
const detail = document.getElementById('exhibit-detail');
const lightbox = initLightbox(document.getElementById('lightbox'));
const loading = document.getElementById('loading-state');
const disposers = [];
let currentRoute;

try {
  const catalog = await fetchGallery();
  const cart = createCartManager(catalog);
  document.getElementById('brand-name').setAttribute('brand-label', catalog.brand);
  document.getElementById('hero-subtitle').textContent = catalog.description;
  document.getElementById('about-description').textContent = catalog.description;
  document.getElementById('footer-year').textContent = String(new Date().getFullYear());
  const options = {
    onOpen: (items, index) => lightbox.open(items, index),
    onAdd: artwork => {
      cart.add(artwork);
      document.getElementById('cart-toast').textContent = `Added to Basket · ${artwork.title}`;
      showElement(document.getElementById('cart-toast'));
    },
  };
  const renderCart = () => renderCartView(document.getElementById('cart-populated'), cart.items(), id => cart.remove(id));
  disposers.push(cart.subscribe(() => {
    document.getElementById('cart-count').textContent = String(cart.items().length);
    if (currentRoute?.route === ROUTES.CART) renderCart();
  }));
  const refreshBasket = () => {
    const notice = document.getElementById('cart-toast');
    try {
      cart.reload();
      hideElement(notice);
    } catch {
      notice.textContent = 'The basket could not update. Check browser storage before checkout.';
      showElement(notice);
    }
  };
  const onStorage = event => {
    if (event.storageArea === localStorage && (event.key === STORAGE_KEYS.cart || event.key === null)) refreshBasket();
  };
  const onPageShow = event => { if (event.persisted) refreshBasket(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', onPageShow);
  disposers.push(() => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', onPageShow);
  });
  disposers.push(subscribe(route => {
    currentRoute = route;
    if (document.getElementById('lightbox').open) lightbox.close();
    Object.values(views).forEach(hideElement);
    document.querySelector('.hero').classList.toggle('is-hidden', route.route !== ROUTES.HOME);
    for (const link of document.querySelectorAll('#nav-links a')) {
      if (link.getAttribute('href') === routeHref(route.route, route.id)) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    let presentation = null;
    if (route.route === ROUTES.HOME) {
      showElement(views.home); renderExhibitGroups(document.getElementById('exhibit-groups'), catalog);
    } else if (route.route === ROUTES.ABOUT) showElement(views.about);
    else if (route.route === ROUTES.CART) { showElement(views.cart); renderCart(); }
    else {
      showElement(views.detail);
      if (route.route === ROUTES.EXHIBIT) {
        presentation = catalog.exhibits.find(item => item.id === route.id);
        if (presentation) renderExhibitDetail(detail, presentation, catalog, options);
      } else if (route.route === ROUTES.COLLECTION) {
        presentation = catalog.collections.find(item => item.id === route.id);
        if (presentation) renderCollectionDetail(detail, presentation, catalog, options);
      } else if (route.route === ROUTES.ARTWORK) {
        presentation = catalog.artworks.find(item => item.id === route.id);
        if (presentation) {
          detail.replaceChildren(presentationHeader(presentation.title, ''));
          renderArtworkGrid(detail, [presentation], options);
          detail.querySelector('.artwork-card__title').remove();
          detail.querySelector('.artwork-card__media img').src = presentation.image.lightboxUrl;
        }
      }
      if (!presentation) { const notice = element('p', 'alert', STRINGS.unavailable); notice.setAttribute('role', 'alert'); detail.replaceChildren(notice); }
    }
    applyMetadata(catalog, route, presentation);
  }));
} catch (error) {
  const notice = element('p', 'alert', 'The gallery could not load. Reload the page to try again.'); notice.setAttribute('role', 'alert');
  views.home.replaceChildren(notice); showElement(views.home);
  console.error('Load gallery:', error);
} finally { hideElement(loading); }
window.addEventListener('pagehide', event => { if (!event.persisted) disposers.forEach(dispose => dispose()); });
