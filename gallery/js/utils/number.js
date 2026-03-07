// @ts-check

/**
 * @param {number} value
 * @param {string} [currency]
 * @returns {string}
 */
export function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}
