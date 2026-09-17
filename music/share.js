// @ts-check
import { musicIcon } from "./icons.js";

const feedbackLabels = {
  copied: "Link copied",
  copyFailed: "Could not copy link",
  unavailable: "Sharing unavailable",
};
/** @typedef {keyof typeof feedbackLabels} ShareOutcome */
/** @type {WeakMap<HTMLButtonElement, () => void>} */
const pendingResets = new WeakMap();

/** @param {HTMLButtonElement} button */
function beginFeedback(button) {
  pendingResets.get(button)?.();
  const originalHtml = button.innerHTML;
  const originalLabel = button.getAttribute("aria-label");
  const originalTitle = button.getAttribute("title");
  /** @type {number | undefined} */
  let timer;
  const restore = () => {
    window.clearTimeout(timer);
    button.classList.remove("is-copied");
    button.innerHTML = originalHtml;
    if (originalLabel !== null) button.setAttribute("aria-label", originalLabel);
    else button.removeAttribute("aria-label");
    if (originalTitle !== null) button.setAttribute("title", originalTitle);
    else button.removeAttribute("title");
    pendingResets.delete(button);
  };
  pendingResets.set(button, restore);
  /** @param {ShareOutcome} outcome */
  return (outcome) => {
    if (pendingResets.get(button) !== restore) return;
    const success = outcome === "copied";
    button.classList.toggle("is-copied", success);
    button.innerHTML = musicIcon(success ? "check" : "retry");
    button.setAttribute("aria-label", feedbackLabels[outcome]);
    button.title = feedbackLabels[outcome];
    timer = window.setTimeout(restore, 2000);
  };
}

/**
 * Copy a track link to the clipboard.
 * @param {import('./catalog.js').Track} track
 * @param {import('./catalog.js').Album} album
 * @param {HTMLButtonElement} [button]
 */
export async function shareTrack(track, album, button) {
  const url = `${window.location.origin}/music/${album.slug}/#${track.slug}`;
  const feedback = button ? beginFeedback(button) : undefined;
  /** @type {ShareOutcome} */
  let outcome;
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(url);
      outcome = "copied";
    } else {
      outcome = "unavailable";
    }
  } catch {
    outcome = "copyFailed";
  }
  feedback?.(outcome);
}
