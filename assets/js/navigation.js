// @ts-check
/** @typedef {{pop?: boolean, index?: number}} NavigationOptions */
/** Document navigation keeps the music player connected while page content changes. */
const LEAVE = 'site:page-leave';
const BEFORE = 'site:before-navigate';
const NAVIGATION_SCRIPT = '/assets/js/navigation.js';
let displayedURL = new URL(location.href);
let request = null;
let committing = false;
let pendingNavigation;
let pendingPageElements;
let historyHashTransition;
const scripts = new Set([...document.scripts].filter(node => node.src).map(node => node.src));
const positions = new Map();
let historyIndex = history.state?.siteIndex ?? 0;
history.replaceState({ ...history.state, siteIndex: historyIndex }, '');
history.scrollRestoration = 'manual';
const importMaps = new Set([...document.querySelectorAll('script[type="importmap"]')].map(node => node.textContent));

/** @param {string | URL} url */
export function pushPageURL(url) {
  positions.set(historyIndex, { x: scrollX, y: scrollY });
  historyIndex += 1;
  history.pushState({ siteIndex: historyIndex }, '', url);
  displayedURL = new URL(location.href);
}

/** @param {() => void} dispose */
export function onPageLeave(dispose) {
  window.addEventListener(LEAVE, dispose, { once: true });
}
/**
 * Initial document scripts mount once; subsequent visits mount through navigation.
 * @param {() => void | Promise<void>} mount
 */
export function initializePage(mount) {
  if (!committing) void mount();
}
export function pageEvents() {
  const events = new AbortController();
  onPageLeave(() => events.abort());
  return { signal: events.signal };
}
/** @param {() => boolean} guard */
export function beforeNavigate(guard) {
  const listener = event => { if (!guard()) event.preventDefault(); };
  window.addEventListener(BEFORE, listener, pageEvents());
}

function showError(url, message) {
  document.getElementById('site-navigation-error')?.remove();
  const notice = document.createElement('aside');
  notice.id = 'site-navigation-error';
  notice.setAttribute('role', 'alert');
  notice.append(message + ' ');
  const retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = 'Try again';
  retry.addEventListener('click', () => void navigate(url));
  notice.append(retry);
  document.body.prepend(notice);
}

async function runScript(source, url) {
  const src = source.getAttribute('src');
  if (src) {
    const target = new URL(src, url);
    if (target.pathname === NAVIGATION_SCRIPT) return;
    if (target.pathname.endsWith('/mpr-ui.js') && customElements.get('mpr-header')) return;
    if (target.origin === location.origin && source.type === 'module') {
      const page = await import(target.href);
      if (typeof page.mountPage !== 'function') throw new Error(`Missing page entry: ${target.pathname}`);
      await page.mountPage();
      return;
    }
    if (scripts.has(target.href) || [...document.scripts].some(node => node.src === target.href)) return;
    await new Promise((resolve, reject) => {
      const node = document.createElement('script');
      for (const attribute of source.attributes) node.setAttribute(attribute.name, attribute.value);
      node.src = target.href; node.async = false;
      node.onload = resolve;
      node.onerror = () => reject(new Error(`Cannot load ${target.pathname}`));
      document.head.append(node);
    });
    scripts.add(target.href);
    return;
  }
  if (source.type === 'importmap') {
    if (importMaps.has(source.textContent)) return;
    importMaps.add(source.textContent);
  }
  const node = document.createElement('script');
  for (const attribute of source.attributes) node.setAttribute(attribute.name, attribute.value);
  node.textContent = source.textContent;
  if (source.type === 'module') throw new Error('Page modules require a source URL.');
  document.head.append(node);
  if (source.type !== 'importmap') node.remove();
}

/**
 * Navigate to a site page without detaching the active audio element.
 * @param {string | URL} destination
 * @param {NavigationOptions} options
 */
export async function navigate(destination, options = {}) {
  const target = new URL(destination, location.href);
  if (committing) { pendingNavigation = { destination: target, options }; return; }
  if (!window.dispatchEvent(new Event(BEFORE, { cancelable: true }))) {
    if (options.pop) history.go(historyIndex - options.index);
    return;
  }
  request?.abort();
  if (pendingPageElements) for (const [node, inert] of pendingPageElements) node.inert = inert;
  const operation = new AbortController(); request = operation;
  positions.set(historyIndex, { x: scrollX, y: scrollY });
  const previousElements = [...document.body.children].filter(node => node instanceof HTMLElement && node.id !== 'music-player').map(node => [node, node.inert]);
  pendingPageElements = previousElements;
  for (const [node] of previousElements) node.inert = true;
  let pageElements = [];
  let ownsCommit = false;
  const preparedStyles = new Map();
  try {
    const response = await fetch(target, { signal: operation.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page unavailable');
    const nextURL = new URL(response.url);
    if (nextURL.origin !== location.origin) throw new Error('Unexpected page origin');
    nextURL.hash = target.hash;
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!next.querySelector(`script[src="${NAVIGATION_SCRIPT}"]`)) throw new Error('Invalid site page');
    // Load the configuration API before inserting an auth header. The UI bundle
    // already belongs to this document and must not define its elements again.
    const uiConfig = next.querySelector('script[src$="/mpr-ui-config.js"]');
    if (uiConfig) await runScript(uiConfig, nextURL);
    await Promise.all([...next.head.querySelectorAll('link[rel="stylesheet"]')].map(source => new Promise((resolve, reject) => {
      const sheet = document.createElement('link');
      for (const attribute of source.attributes) sheet.setAttribute(attribute.name, attribute.value);
      sheet.href = new URL(source.getAttribute('href'), nextURL).href;
      sheet.media = source.getAttribute('media') || 'all';
      preparedStyles.set(source, sheet);
      sheet.onload = resolve;
      sheet.onerror = () => reject(new Error(`Cannot load ${sheet.href}`));
      document.head.append(sheet);
    })));
    if (operation.signal.aborted) return;
    committing = true; ownsCommit = true;
    window.dispatchEvent(new Event(LEAVE));
    if (!options.pop) {
      historyIndex += 1;
      history.pushState({ siteIndex: historyIndex }, '', nextURL);
    } else historyIndex = options.index;
    displayedURL = nextURL;
    const executable = [...next.querySelectorAll('script')].filter(node => !node.type || ['module', 'text/javascript', 'importmap'].includes(node.type));
    executable.forEach(node => node.remove());
    // Keep the player in place: even reparenting an audio element can stop playback.
    for (const child of [...document.body.childNodes]) {
      if (!(child instanceof Element && child.id === 'music-player')) child.remove();
    }
    for (const attribute of [...document.body.attributes]) document.body.removeAttribute(attribute.name);
    for (const attribute of next.body.attributes) document.body.setAttribute(attribute.name, attribute.value);
    // Import into the live document so styles and custom elements activate in WebKit.
    const content = document.importNode(next.body, true);
    pageElements = [...content.children].filter(node => node instanceof HTMLElement).map(node => [node, node.inert]);
    for (const [node] of pageElements) node.inert = true;
    document.body.append(...content.childNodes);
    document.head.querySelectorAll('title, meta:not([name="viewport"]):not([charset]), link, style:not([id^="mpr-ui-"]), script[type="application/ld+json"]').forEach(node => {
      if (![...preparedStyles.values()].includes(node)) node.remove();
    });
    for (const node of [...document.head.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    const headNodes = [...next.head.childNodes];
    for (const [index, node] of headNodes.entries()) {
      // The viewport and encoding belong to the document, not to a page visit.
      if (node instanceof Element && node.matches('meta[name="viewport"], meta[charset]')) continue;
      const sheet = preparedStyles.get(node);
      if (sheet) sheet.media = node.getAttribute('media') || 'all';
      else {
        const followingSheet = headNodes.slice(index + 1).find(item => preparedStyles.has(item));
        document.head.insertBefore(document.importNode(node, true), preparedStyles.get(followingSheet) || null);
      }
    }
    for (const source of executable) await runScript(source, nextURL);
    const authHost = document.querySelector('mpr-header[data-config-url]');
    if (authHost) await globalThis.MPRUI.applyYamlConfig({ configUrl: authHost.getAttribute('data-config-url') });
    for (const [node, inert] of pageElements) node.inert = inert;
    const heading = document.querySelector('main h1, h1');
    if (heading instanceof HTMLElement) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    await new Promise(resolve => requestAnimationFrame(resolve));
    const anchor = nextURL.hash && document.getElementById(decodeURIComponent(nextURL.hash.slice(1)));
    const position = options.pop && positions.get(historyIndex);
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(position?.x || 0, position?.y || 0);
  } catch (error) {
    if (operation.signal.aborted) return;
    if (options.pop && !committing) history.go(historyIndex - options.index);
    showError(target, committing ? 'Page controls could not load.' : 'The page could not load. Your current page is still open.');
  } finally {
    if (pendingPageElements === previousElements) {
      for (const [node, inert] of previousElements) node.inert = inert;
      pendingPageElements = null;
    }
    for (const [node, inert] of pageElements) node.inert = inert;
    if (!ownsCommit) for (const sheet of preparedStyles.values()) sheet.remove();
    if (request === operation) request = null;
    if (ownsCommit) committing = false;
    if (!committing && pendingNavigation) {
      const pending = pendingNavigation; pendingNavigation = null;
      void navigate(pending.destination, pending.options);
    }
  }
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element && event.target.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement) || link.download || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  if (!url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) return;
  event.preventDefault();
  void navigate(url);
});
window.addEventListener('popstate', event => {
  historyHashTransition = location.href;
  if (location.pathname === displayedURL.pathname) {
    if (event.state?.siteIndex === undefined) {
      historyIndex += 1;
      history.replaceState({ siteIndex: historyIndex }, '');
    } else historyIndex = event.state.siteIndex;
    displayedURL = new URL(location.href);
    const position = positions.get(historyIndex);
    if (position) window.scrollTo(position.x, position.y);
    return;
  }
  event.stopImmediatePropagation();
  void navigate(location.href, { pop: true, index: event.state?.siteIndex ?? 0 });
}, { capture: true });

window.addEventListener('hashchange', () => {
  if (historyHashTransition === location.href) { historyHashTransition = null; return; }
  historyHashTransition = null;
  if (displayedURL.href === location.href) return;
  historyIndex += 1;
  history.replaceState({ ...history.state, siteIndex: historyIndex }, '');
  displayedURL = new URL(location.href);
});
