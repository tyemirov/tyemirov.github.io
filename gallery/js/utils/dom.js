// @ts-check

/**
 * @param {Element | null} element
 * @returns {asserts element is HTMLElement}
 */
export function assertElement(element) {
  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
}

/**
 * @param {Element} element
 */
export function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * @param {HTMLElement} element
 */
export function showElement(element) {
  element.classList.remove('is-hidden');
  element.setAttribute('aria-hidden', 'false');
}

/**
 * @param {HTMLElement} element
 */
export function hideElement(element) {
  element.classList.add('is-hidden');
  element.setAttribute('aria-hidden', 'true');
}

/**
 * @param {HTMLElement} element
 * @param {string} text
 */
export function setText(element, text) {
  element.textContent = text;
}

/**
 * @param {HTMLElement} element
 * @param {string} html
 * @returns {HTMLElement}
 */
export function replaceWithHTML(element, html) {
  clearChildren(element);
  element.insertAdjacentHTML('afterbegin', html);
  const first = element.firstElementChild;
  if (!(first instanceof HTMLElement)) {
    throw new Error('Expected first child to be an HTMLElement');
  }
  return first;
}
