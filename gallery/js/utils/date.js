// @ts-check

/**
 * @param {string} isoDate
 * @returns {Date}
 */
export function parseISODate(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function getTodayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * @param {string} startISO
 * @param {string} endISO
 * @param {string | string[] | undefined} [locales]
 * @returns {string}
 */
export function formatDateRange(startISO, endISO, locales) {
  const formatter = new Intl.DateTimeFormat(locales, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const start = parseISODate(startISO);
  const end = parseISODate(endISO);

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
