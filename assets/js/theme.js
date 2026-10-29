// @ts-check
import { initializePage } from './navigation.js';
import { THEME_CONFIG, DEFAULT_THEME } from './theme-config.js';

const STORAGE_ERROR_EVENT = 'mpr-ui:theme-storage-error';

document.addEventListener(STORAGE_ERROR_EVENT, () => {
  const status = document.getElementById('site-theme-status');
  status.textContent = 'Could not save the theme. Try the switch again.';
  status.hidden = false;
});
customElements.whenDefined('mpr-theme-toggle').then(() => {
  globalThis.MPRUI.onThemeChange(({ source }) => {
    if (source === 'configure') return;
    document.getElementById('site-theme-status').hidden = true;
  });
});

function restorePreference() {
  const mode = localStorage.getItem(THEME_CONFIG.storageKey) ?? DEFAULT_THEME;
  if (!THEME_CONFIG.modes.includes(mode)) throw new Error(`site.theme_invalid_preference: ${mode}`);
  globalThis.MPRUI.configureTheme({ ...THEME_CONFIG, mode });
}

export async function mountPage() {
  await customElements.whenDefined('mpr-theme-toggle');
  restorePreference();
}

window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === THEME_CONFIG.storageKey || event.key === null)) {
    restorePreference();
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted) restorePreference();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && globalThis.MPRUI) restorePreference();
});
initializePage(mountPage);
