// @ts-check

export const THEME_CONFIG = Object.freeze({
  storageKey: 'tyemirov:theme',
  attribute: 'data-theme',
  modes: ['light', 'dark'],
});
export const THEME_CONTROL = Object.freeze({ kind: 'cycle', choices: ['light', 'dark'] });
export const DEFAULT_THEME = 'light';
