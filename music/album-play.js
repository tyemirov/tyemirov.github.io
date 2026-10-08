// @ts-check
import { musicIcon } from "./icons.js";

/** @param {string} value */
const attribute = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** @param {import('./catalog.js').Album} album */
export function albumPlayMarkup(album) {
  const firstTrack = album.tracks.find(track => track.playback.kind === "file");
  if (!firstTrack) return "";
  const title = album.displayTitle ?? album.title;
  const label = `Play ${title}`;
  return `<button type="button" class="album-play" disabled data-first-track="${attribute(firstTrack.id)}" data-play-album="${attribute(album.slug)}" data-album-title="${attribute(title)}" aria-label="${attribute(label)}" title="${attribute(label)}">${musicIcon("play")}</button>`;
}
