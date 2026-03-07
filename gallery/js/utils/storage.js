// @ts-check

/**
 * Safely resolve a usable Web Storage reference.
 * @returns {Storage | null}
 */
function resolveStorage() {
  try {
    const candidate = window.localStorage;
    const probeKey = '__storage_probe__';
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch (error) {
    return null;
  }
}

const storage = resolveStorage();

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function readJSON(key, fallback) {
  if (!storage) {
    return fallback;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    try {
      storage.removeItem(key);
    } catch (removeError) {
      // Ignore secondary storage errors so callers are never interrupted.
    }
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function writeJSON(key, value) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore write errors when storage is not available or quota is exceeded.
  }
}
