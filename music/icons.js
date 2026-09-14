// @ts-check
const paths = {
  spotify: '<circle cx="12" cy="12" r="10"/><path d="M6 9c4-1.5 8-1 12 1M7 12.5c3.4-1 6.7-.6 10 1M8 16c2.7-.7 5.3-.4 8 1"/>',
  youtube: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6.5"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/>',
  amazon: '<path d="M7 8c0-5 10-5 10 0v7m0-5c-3-3-10-2-10 2 0 4 7 4 10-1M4 19c5 3 11 3 16-1m-4 0h4v4"/>',
  apple: '<path d="M10 17V6l10-2v11M10 9l10-2"/><ellipse cx="7" cy="18" rx="3" ry="2" fill="currentColor"/><ellipse cx="17" cy="16" rx="3" ry="2" fill="currentColor"/>',
  suno: '<path d="M4 9v6M8 5v14M12 8v8M16 3v18M20 7v10" stroke-width="2.8"/>',
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
