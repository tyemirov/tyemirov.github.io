// @ts-check

/** @type {const} */
export const DATA_ENDPOINTS = Object.freeze({
  site: 'data/site.json',
  exhibits: 'data/exhibits.json'
});

/** @type {const} */
export const ROUTES = Object.freeze({
  HOME: 'home',
  EXHIBIT: 'exhibit',
  ABOUT: 'about',
  CART: 'cart'
});

/** @type {const} */
export const STATUS_GROUPS = Object.freeze([
  { id: 'now', title: 'Now Showing' },
  { id: 'upcoming', title: 'Upcoming' },
  { id: 'closed', title: 'Closed' }
]);

/** @type {const} */
export const STATUS_LABELS = Object.freeze({
  now: 'Now Showing',
  upcoming: 'Upcoming',
  closed: 'Closed'
});

/** @type {const} */
export const STORAGE_KEYS = Object.freeze({
  cart: 'vt_virtual_gallery_cart'
});

/** @type {const} */
export const STRINGS = Object.freeze({
  galleryTitle: 'Vadym Tyemirov · Virtual Gallery',
  galleryDescription: 'A modern salon for digital works. Discover, collect, and enjoy limited edition exhibits by Vadym Tyemirov.',
  heroTitle: 'Virtual Gallery',
  heroSubtitle: 'Now Showing · Upcoming · Closed',
  loadingMessage: 'Loading exhibitions…',
  emptyStateTitle: 'No exhibits to display',
  emptyStateBody: 'Please check back soon for the latest releases.',
  loadErrorTitle: 'Exhibits unavailable',
  loadErrorBody:
    'We could not load the exhibit catalog. If you are running the site locally, serve it over https:// or http:// instead of using the file:// protocol.',
  artworksLabel: 'Digital pigment print',
  priceOnRequest: 'Price on request',
  cartEmpty: 'Your basket is empty. Begin your collection from the exhibits.',
  toastAdded: 'Added to Basket',
  thankYouMessage: 'Thank you. Payment completed.',
  paymentError: 'Payment error. Please try again.',
  specsToggleLabel: 'For the curious',
  specsPlayfulFooter: 'No solvents were harmed.'
});

/** @type {const} */
export const PAYPAL_CONTAINER_ID = 'paypal-button-container';

/** @type {const} */
export const REQUEST_TIMEOUT_MS = 15000;

/** @type {const} */
export const TOAST_TIMEOUT_MS = 2400;
