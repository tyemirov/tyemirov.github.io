// @ts-check
import './types.d.js';
import { PAYPAL_CONTAINER_ID, ROUTES, STRINGS } from './constants.js';
import { fetchExhibitCatalog, fetchSiteConfig } from './core/gateway.js';
import { cartManager } from './core/cart.js';
import {
  createExhibitViewModel,
  findExhibitById,
  flattenCollectionArtworks,
  groupExhibits,
  normalizeCatalog,
  partitionExhibits
} from './core/catalog.js';
import { subscribe as subscribeToRoute, navigate } from './core/router.js';
import { renderExhibitGroups } from './ui/exhibitList.js';
import { renderExhibitDetail } from './ui/exhibitDetail.js';
import { renderCartView, renderEmptyCart } from './ui/cartView.js';
import { renderExhibitCarousel } from './ui/carousel.js';
import { renderCollectionSection } from './ui/collection.js';
import { initSectionNav } from './ui/homeNav.js';
import { initLightbox } from './ui/lightbox.js';
import { wireNavigation, updateHeroBranding } from './ui/nav.js';
import { createToast } from './ui/toast.js';
import { applyDefaultMetadata, applyExhibitMetadata } from './ui/meta.js';
import { createLogger } from './utils/logging.js';
import { hideElement, setText, showElement } from './utils/dom.js';

const logger = createLogger('app');

const elements = {
  loading: /** @type {HTMLElement} */ (document.getElementById('loading-state')),
  homeView: /** @type {HTMLElement} */ (document.getElementById('home-view')),
  exhibitView: /** @type {HTMLElement} */ (document.getElementById('exhibit-view')),
  aboutView: /** @type {HTMLElement} */ (document.getElementById('about-view')),
  cartView: /** @type {HTMLElement} */ (document.getElementById('cart-view')),
  heroCarousel: /** @type {HTMLElement} */ (document.getElementById('hero-carousel')),
  carouselMount: /** @type {HTMLElement} */ (document.getElementById('exhibit-carousel')),
  heroPlaceholder: /** @type {HTMLElement} */ (document.getElementById('hero-placeholder')),
  sectionNav: /** @type {HTMLElement} */ (document.getElementById('section-nav')),
  exhibitGroups: /** @type {HTMLElement} */ (document.getElementById('exhibit-groups')),
  collectionSection: /** @type {HTMLElement} */ (document.getElementById('collection-section')),
  exhibitDetail: /** @type {HTMLElement} */ (document.getElementById('exhibit-detail')),
  cartEmpty: /** @type {HTMLElement} */ (document.getElementById('cart-empty')),
  cartPopulated: /** @type {HTMLElement} */ (document.getElementById('cart-populated')),
  cartCount: /** @type {HTMLElement} */ (document.getElementById('cart-count')),
  heroTitle: /** @type {HTMLElement} */ (document.getElementById('hero-title')),
  heroSubtitle: /** @type {HTMLElement} */ (document.getElementById('hero-subtitle')),
  brandName: /** @type {HTMLElement} */ (document.getElementById('brand-name')),
  navLinks: /** @type {HTMLElement} */ (document.getElementById('nav-links')),
  footerYear: /** @type {HTMLElement} */ (document.getElementById('footer-year')),
  lightbox: /** @type {HTMLDialogElement | null} */ (document.getElementById('lightbox')),
  cartToast: /** @type {HTMLElement | null} */ (document.getElementById('cart-toast'))
};

const state = {
  exhibits: /** @type {import('./types.d.js').Exhibit[]} */ ([]),
  currency: 'USD',
  brand: STRINGS.galleryTitle,
  siteUrl: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || window.location.href,
  activeExhibitId: /** @type {string | undefined} */ (undefined),
  carouselIndex: 0,
  homeAnchors: { now: -1, upcoming: -1 },
  paypalScriptLoaded: false
};

if (elements.footerYear) {
  setText(elements.footerYear, String(new Date().getFullYear()));
}

if (elements.heroTitle && elements.heroSubtitle) {
  updateHeroBranding(elements.heroTitle, elements.heroSubtitle);
}

const loadingIndicator = elements.loading?.querySelector('.loading-indicator');
if (loadingIndicator instanceof HTMLElement) {
  setText(loadingIndicator, STRINGS.loadingMessage);
}

const lightbox = elements.lightbox ? initLightbox(elements.lightbox) : null;
const navigationControls = elements.navLinks ? wireNavigation(elements.navLinks) : { setActiveRoute: () => undefined };
let carouselApi = /** @type {{ goTo: (index: number) => void } | null} */ (null);
const sectionNavControls = elements.sectionNav
  ? initSectionNav(elements.sectionNav, {
      onSelectStatus: handleSectionNavStatus,
      onSelectCollection: handleSectionNavCollection
    })
  : { setState: () => undefined };
const toast = createToast(elements.cartToast);

showElement(elements.loading);

function deriveSiteUrl(configSiteUrl) {
  if (configSiteUrl) {
    return configSiteUrl;
  }
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if (canonicalHref) {
    return canonicalHref.replace(/\/$/, '');
  }
  const { origin, pathname } = window.location;
  if (origin && origin !== 'null') {
    const basePath = pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    return `${origin}${basePath ? basePath : ''}`;
  }
  return window.location.href.replace(/#.*$/, '');
}

Promise.all([fetchSiteConfig(), fetchExhibitCatalog()])
  .then(([config, catalog]) => {
    state.brand = config.brand || STRINGS.galleryTitle;
    state.currency = (config.payment && config.payment.currency) || 'USD';
    state.siteUrl = deriveSiteUrl(config.siteUrl);
    state.exhibits = normalizeCatalog(catalog);

    if (elements.brandName) {
      setText(elements.brandName, state.brand);
    }

    applyDefaultMetadata({ brand: state.brand, siteUrl: state.siteUrl });

    setupCart();
    setupRouting();
    renderHome();
    ensurePayPalSdk(config.payment?.paypal_client_id, state.currency);
  })
  .catch((error) => {
    logger.error('Failed to initialise application', error);
    renderHomeError();
  })
  .finally(() => {
    hideElement(elements.loading);
  });

function renderHome() {
  if (!elements.homeView || !elements.exhibitGroups || !elements.collectionSection) {
    return;
  }
  showElement(elements.homeView);

  const groups = groupExhibits(state.exhibits, state.currency);
  const partitions = partitionExhibits(state.exhibits, state.currency);
  const activeSlides = partitions.active;
  const navAvailability = {
    hasNow: partitions.now.length > 0,
    hasUpcoming: partitions.upcoming.length > 0
  };

  state.homeAnchors = {
    now: activeSlides.findIndex((exhibit) => exhibit.status === 'now'),
    upcoming: activeSlides.findIndex((exhibit) => exhibit.status === 'upcoming')
  };

  renderExhibitGroups(groups, {
    container: elements.exhibitGroups,
    currency: state.currency,
    onOpenExhibit: (exhibitId) => {
      navigate(ROUTES.EXHIBIT, exhibitId);
    }
  });

  const collectionArtworks = flattenCollectionArtworks(state.exhibits).sort((left, right) => {
    const exhibitCompare = left.exhibitTitle.localeCompare(right.exhibitTitle);
    if (exhibitCompare !== 0) {
      return exhibitCompare;
    }
    return left.title.localeCompare(right.title);
  });

  renderCollectionSection(elements.collectionSection, collectionArtworks, {
    currency: state.currency,
    onAddToCart: (artwork) => {
      cartManager.add(artwork, { exhibitId: artwork.exhibitId, exhibitTitle: artwork.exhibitTitle });
      toast.show(`${STRINGS.toastAdded} · ${artwork.title}`);
    },
    onViewExhibit: (exhibitId) => {
      navigate(ROUTES.EXHIBIT, exhibitId);
    }
  });

  if (elements.sectionNav) {
    showElement(elements.sectionNav);
  }

  if (activeSlides.length > 0 && elements.carouselMount && elements.heroCarousel && elements.heroPlaceholder) {
    carouselApi = renderExhibitCarousel(elements.carouselMount, activeSlides, {
      initialIndex: state.carouselIndex,
      onOpenExhibit: (exhibitId) => {
        navigate(ROUTES.EXHIBIT, exhibitId);
      },
      onSlideChange: (index, exhibit) => {
        state.carouselIndex = index;
        const activeStatus = exhibit?.status === 'upcoming' ? 'upcoming' : 'now';
        sectionNavControls.setState({
          active: activeStatus,
          hasNow: navAvailability.hasNow,
          hasUpcoming: navAvailability.hasUpcoming
        });
      }
    });

    if (carouselApi) {
      showElement(elements.heroCarousel);
      hideElement(elements.heroPlaceholder);
    } else {
      hideElement(elements.heroCarousel);
      showElement(elements.heroPlaceholder);
      sectionNavControls.setState({
        active: 'collection',
        hasNow: navAvailability.hasNow,
        hasUpcoming: navAvailability.hasUpcoming
      });
    }
  } else {
    carouselApi = null;
    state.carouselIndex = 0;
    if (elements.heroCarousel) {
      hideElement(elements.heroCarousel);
    }
    if (elements.heroPlaceholder) {
      showElement(elements.heroPlaceholder);
    }
    sectionNavControls.setState({
      active: 'collection',
      hasNow: navAvailability.hasNow,
      hasUpcoming: navAvailability.hasUpcoming
    });
  }
}

function renderHomeError() {
  if (!elements.homeView || !elements.exhibitGroups) {
    return;
  }
  showElement(elements.homeView);
  carouselApi = null;
  state.carouselIndex = 0;
  state.homeAnchors = { now: -1, upcoming: -1 };
  if (elements.heroCarousel) {
    hideElement(elements.heroCarousel);
  }
  if (elements.heroPlaceholder) {
    showElement(elements.heroPlaceholder);
  }
  if (elements.sectionNav) {
    showElement(elements.sectionNav);
  }
  sectionNavControls.setState({ active: 'collection', hasNow: false, hasUpcoming: false });
  elements.exhibitGroups.innerHTML = `
    <div class="alert" role="alert">
      <h2>${STRINGS.loadErrorTitle}</h2>
      <p>${STRINGS.loadErrorBody}</p>
    </div>
  `;
  if (elements.collectionSection) {
    elements.collectionSection.innerHTML = '';
  }
}

function setupRouting() {
  subscribeToRoute(({ route, exhibitId }) => {
    navigationControls.setActiveRoute(route);
    toggleRoute(route);
    if (route === ROUTES.HOME) {
      applyDefaultMetadata({ brand: state.brand, siteUrl: state.siteUrl });
      renderHome();
      return;
    }
    if (route === ROUTES.EXHIBIT) {
      state.activeExhibitId = exhibitId;
      renderExhibit(exhibitId);
      return;
    }
    if (route === ROUTES.CART) {
      applyDefaultMetadata({ brand: state.brand, siteUrl: state.siteUrl });
      renderCart();
      return;
    }
    if (route === ROUTES.ABOUT) {
      applyDefaultMetadata({ brand: state.brand, siteUrl: state.siteUrl });
    }
  });
}

function toggleRoute(route) {
  const routeMap = [
    { view: elements.homeView, key: ROUTES.HOME },
    { view: elements.exhibitView, key: ROUTES.EXHIBIT },
    { view: elements.aboutView, key: ROUTES.ABOUT },
    { view: elements.cartView, key: ROUTES.CART }
  ];

  routeMap.forEach(({ view, key }) => {
    if (!view) {
      return;
    }
    if (key === route) {
      showElement(view);
    } else {
      hideElement(view);
    }
  });
}

function renderExhibit(exhibitId) {
  if (!elements.exhibitDetail) {
    return;
  }
  const exhibit = exhibitId ? findExhibitById(state.exhibits, exhibitId) : undefined;
  const viewModel = exhibit ? createExhibitViewModel(exhibit, state.currency) : undefined;
  renderExhibitDetail(elements.exhibitDetail, viewModel, {
    currency: state.currency,
    onAddToCart: ({ exhibit: exhibitVm, artwork }) => {
      cartManager.add(artwork, { exhibitId: exhibitVm.id, exhibitTitle: exhibitVm.title });
      toast.show(`${STRINGS.toastAdded} · ${artwork.title}`);
    },
    onOpenMedia: (source, title) => {
      if (lightbox) {
        lightbox.open(source, title);
      }
    }
  });

  if (viewModel) {
    applyExhibitMetadata(viewModel, { siteUrl: state.siteUrl, currency: state.currency, brand: state.brand });
  } else {
    applyDefaultMetadata({ brand: state.brand, siteUrl: state.siteUrl });
  }
}

function setupCart() {
  cartManager.subscribe((items) => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    if (elements.cartCount) {
      setText(elements.cartCount, String(totalQuantity));
    }

    if (elements.cartEmpty && elements.cartPopulated) {
      if (items.length === 0) {
        renderEmptyCart(elements.cartEmpty);
        hideElement(elements.cartPopulated);
      } else {
        hideElement(elements.cartEmpty);
        renderCartView(elements.cartPopulated, items, {
          currency: state.currency,
          onRemove: (artworkId) => cartManager.remove(artworkId),
          onQuantityChange: (artworkId, quantity) => cartManager.setQuantity(artworkId, quantity),
          subtotal: cartManager.total()
        });
      }
    }

    if (state.paypalScriptLoaded) {
      renderPayPalButtons();
    }
  });
}

function renderCart() {
  if (!elements.cartView || !elements.cartPopulated) {
    return;
  }
  const items = cartManager.getItems();
  if (items.length === 0 && elements.cartEmpty) {
    renderEmptyCart(elements.cartEmpty);
    hideElement(elements.cartPopulated);
    return;
  }

  renderCartView(elements.cartPopulated, items, {
    currency: state.currency,
    onRemove: (artworkId) => cartManager.remove(artworkId),
    onQuantityChange: (artworkId, quantity) => cartManager.setQuantity(artworkId, quantity),
    subtotal: cartManager.total()
  });
}

/**
 * @param {'now' | 'upcoming'} status
 */
function handleSectionNavStatus(status) {
  const targetIndex = state.homeAnchors[status];
  if (carouselApi && targetIndex >= 0) {
    carouselApi.goTo(targetIndex);
  }

  const targetSection = document.getElementById(`group-${status}`);
  if (targetSection instanceof HTMLElement) {
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function handleSectionNavCollection() {
  if (!elements.collectionSection) {
    return;
  }

  elements.collectionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (typeof elements.collectionSection.focus === 'function') {
    elements.collectionSection.focus({ preventScroll: true });
  }
}

function ensurePayPalSdk(clientId = 'sb', currency = 'USD') {
  if (state.paypalScriptLoaded) {
    renderPayPalButtons();
    return;
  }
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
  script.async = true;
  script.onload = () => {
    state.paypalScriptLoaded = true;
    renderPayPalButtons();
  };
  script.onerror = () => {
    logger.warn('PayPal SDK failed to load');
  };
  document.body.appendChild(script);
}

function renderPayPalButtons() {
  const container = document.getElementById(PAYPAL_CONTAINER_ID);
  if (!container) {
    return;
  }
  container.innerHTML = '';
  const items = cartManager.getItems();
  if (items.length === 0) {
    return;
  }

  /** @type {{ Buttons?: (options: unknown) => { render: (selector: string) => void } }} */
  const paypalNamespace = /** @type {any} */ (window).paypal;

  if (!paypalNamespace || typeof paypalNamespace.Buttons !== 'function') {
    container.innerHTML = '<p class="cart-line__meta">PayPal SDK not available.</p>';
    return;
  }

  const total = cartManager.total().toFixed(2);
  const description = items.map((item) => `${item.exhibitId}:${item.artworkId}×${item.quantity}`).join('; ').slice(0, 120);

  paypalNamespace
    .Buttons({
      style: { layout: 'horizontal', color: 'gold', shape: 'pill', label: 'pay' },
      createOrder: (_data, actions) =>
        actions.order.create({
          purchase_units: [
            {
              amount: { value: total },
              description: description || state.brand
            }
          ]
        }),
      onApprove: (_data, actions) =>
        actions.order.capture().then((details) => {
          container.innerHTML = `<div class="alert alert--info" role="status">${STRINGS.thankYouMessage}<br>Order ID: ${details.id}</div>`;
          cartManager.clear();
        }),
      onError: (error) => {
        logger.error('PayPal error', error);
        container.innerHTML = `<div class="alert" role="alert">${STRINGS.paymentError}</div>`;
      }
    })
    .render(`#${PAYPAL_CONTAINER_ID}`);
}
