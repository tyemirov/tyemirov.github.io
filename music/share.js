// @ts-check
import { musicIcon } from "./icons.js";

const feedbackLabels = {
  copied: "Link copied",
  shared: "Link shared",
  copyFailed: "Could not copy link",
  shareFailed: "Could not share link",
  unavailable: "Sharing unavailable",
};
/** @typedef {keyof typeof feedbackLabels | 'cancelled'} ShareOutcome */
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
    if (outcome === "cancelled") {
      restore();
      return;
    }
    const success = outcome === "copied" || outcome === "shared";
    button.classList.toggle("is-copied", success);
    button.innerHTML = musicIcon(success ? "check" : "retry");
    button.setAttribute("aria-label", feedbackLabels[outcome]);
    button.title = feedbackLabels[outcome];
    timer = window.setTimeout(restore, 2000);
  };
}

/**
 * Share a track with the Web Share API or copy its link to the clipboard.
 * @param {import('./catalog.js').Track} track
 * @param {import('./catalog.js').Album} album
 * @param {HTMLButtonElement} [button]
 */
export async function shareTrack(track, album, button) {
  const url = `${window.location.origin}/music/${album.slug}/#${track.slug}`;
  const title = `${track.title} - ${album.displayTitle ?? album.title} | Vadym Tyemirov`;
  const feedback = button ? beginFeedback(button) : undefined;
  const nativeShare = typeof navigator.share === "function";
  /** @type {ShareOutcome} */
  let outcome;
  try {
    if (nativeShare) {
      await navigator.share({ title, url });
      outcome = "shared";
    } else if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(url);
      outcome = "copied";
    } else {
      outcome = "unavailable";
    }
  } catch (error) {
    outcome = nativeShare ? "shareFailed" : "copyFailed";
    if (nativeShare && error && typeof error === "object" && "name" in error && error.name === "AbortError") outcome = "cancelled";
  }
  feedback?.(outcome);
}
