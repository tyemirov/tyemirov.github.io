// @ts-check
const paths = {
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  previous: '<path d="M5 5v14m13-14L8 12l10 7Z"/>',
  next: '<path d="M19 5v14M6 5l10 7-10 7Z"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
  volume: '<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};

/** Return a decorative icon for an accessibly labeled music control.
 * @param {keyof typeof paths} name
 */
export function musicIcon(name) {
  return `<svg class="music-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
