// @ts-check
/* eslint-disable no-console */

/**
 * @param {string} namespace
 */
export function createLogger(namespace) {
  const prefix = `[${namespace}]`;
  return {
    info: (...values) => console.info(prefix, ...values),
    warn: (...values) => console.warn(prefix, ...values),
    error: (...values) => console.error(prefix, ...values)
  };
}
