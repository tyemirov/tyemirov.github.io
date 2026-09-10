// @ts-check
/** @param {HTMLElement} node */
export function showElement(node) { node.classList.remove('is-hidden'); node.setAttribute('aria-hidden', 'false'); }
/** @param {HTMLElement} node */
export function hideElement(node) { node.classList.add('is-hidden'); node.setAttribute('aria-hidden', 'true'); }
/** @param {string} tag @param {string} [className] @param {string} [text] */
export function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
