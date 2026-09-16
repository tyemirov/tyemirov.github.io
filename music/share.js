// @ts-check
import { musicIcon } from "./icons.js";

/**
 * Share a track via Web Share API or clipboard fallback.
 * @param {import('./catalog.js').Track} track
 * @param {import('./catalog.js').Album} album
 * @param {HTMLButtonElement} [button]
 */
export async function shareTrack(track, album, button) {
  const url = `${window.location.origin}/music/${album.slug}/#${track.slug}`;
  const title = `${track.title} - ${album.displayTitle ?? album.title} | Vadym Tyemirov`;
  let shared = false;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      shared = true;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
    }
  }
  if (!shared && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignore clipboard write rejection
    }
  }
  if (button) {
    const originalHtml = button.innerHTML;
    const originalLabel = button.getAttribute("aria-label");
    const originalTitle = button.title;
    button.classList.add("is-copied");
    button.innerHTML = musicIcon("check");
    button.setAttribute("aria-label", "Link copied");
    button.title = "Link copied";
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.innerHTML = originalHtml;
      if (originalLabel) button.setAttribute("aria-label", originalLabel);
      else button.removeAttribute("aria-label");
      if (originalTitle) button.title = originalTitle;
      else button.removeAttribute("title");
    }, 2000);
  }
}
