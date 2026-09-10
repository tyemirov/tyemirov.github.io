// @ts-check
import { PLATFORMS } from "./catalog.js";
import { renderMarkdown } from "../assets/js/markdown.js";
import { musicIcon } from "./icons.js";

/** @param {string} tag @param {string} className @param {string} [text] */
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cover(album, className) {
  const container = element("div", className);
  const image = document.createElement("img");
  image.src = album.coverImage;
  image.alt = `${album.title} cover`;
  image.loading = "lazy";
  container.append(image);
  return container;
}

function platformLinks(album) {
  const links = element("div", "links-grid");
  for (const [platform, href] of Object.entries(album.streamingLinks)) {
    const link = document.createElement("a");
    link.className = "streaming-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = PLATFORMS[platform];
    links.append(link);
  }
  return links;
}

/** @param {import('./catalog.js').Music} music */
export function renderMusicIndex(music, contact) {
  const grid = document.querySelector("#album-grid");
  const albums = music.items.filter((album) => album.status === "live").sort((a, b) => a.order - b.order);
  grid.replaceChildren(...albums.map((album) => {
    const card = element("article", "album-card");
    card.append(cover(album, "album-cover"), element("h2", "album-title", album.displayTitle ?? album.title));
    if (album.translation) card.append(element("p", "album-translation", album.translation));
    card.append(element("p", "album-meta", `${album.latest ? "Latest Release • " : ""}${album.releaseDate.value} • ${album.tracks.length} Tracks`));
    card.append(element("p", "album-description", album.subtitle));
    const actions = element("div", "album-actions");
    const details = document.createElement("a");
    details.className = "listen-button";
    details.href = `/music/${album.slug}/`;
    details.textContent = "Album Notes";
    actions.append(details);
    card.append(actions, platformLinks(album));
    return card;
  }));
  const contactLine = element("p", "lead");
  const contactLink = document.createElement("a");
  contactLink.href = contact.href;
  contactLink.textContent = contact.label;
  contactLine.append("Artist contact: ", contactLink);
  document.querySelector(".header-copy").append(contactLine);
}

/** @param {import('./catalog.js').Album} album */
export function renderAlbumDetails(album) {
  document.title = `${album.title} | Vadym Tyemirov`;
  const article = element("article", "album-detail");
  const layout = element("div", "album-layout");
  const sidebar = element("aside", "album-sidebar");
  const platforms = element("div", "streaming-links");
  platforms.append(element("p", "links-label", "Listen on:"), platformLinks(album));
  sidebar.append(cover(album, "album-cover-large"), platforms);
  const content = element("div", "album-content");
  const header = element("header", "album-header");
  header.append(element("h1", "album-title-large", album.displayTitle ?? album.title));
  if (album.translation) header.append(element("p", "album-translation-large", album.translation));
  header.append(element("p", "album-meta-large", `${album.latest ? "Latest Release • " : ""}${album.releaseDate.value} • ${album.tracks.length} Tracks`));
  const notes = element("section", "album-notes");
  const authoredNotes = element("div", "notes-body");
  // Only repository-authored notes from the validated publication catalog enter this markup boundary.
  authoredNotes.innerHTML = renderMarkdown(album.notes.text);
  notes.append(element("p", "lead-text", album.subtitle), authoredNotes);
  const trackSection = element("section", "tracklist-section");
  trackSection.append(element("h2", "section-subtitle", "Track List"));
  const list = element("ol", "track-list");
  for (const track of album.tracks) {
    const row = element("li", "track-row");
    row.dataset.trackId = track.id;
    row.append(element("span", "track-title", track.title));
    if (track.playback.kind === "hls") {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = true;
      button.className = "track-play";
      button.dataset.playTrack = track.id;
      button.setAttribute("aria-label", `Play ${track.title}`);
      button.title = `Play ${track.title}`;
      button.innerHTML = musicIcon("play");
      row.append(button);
    }
    list.append(row);
  }
  trackSection.append(list);
  const credits = element("section", "credits-section");
  credits.append(element("h2", "section-subtitle", "Credits"), element("div", "credits-body", album.credits));
  content.append(header, notes, trackSection, credits);
  layout.append(sidebar, content);
  article.append(layout);
  document.querySelector("#album-container").replaceChildren(article);
}

export function renderMusicError(message) {
  const error = element("p", "music-error", message);
  error.setAttribute("role", "alert");
  const container = document.querySelector("#album-container, #album-grid, .music-list");
  container.replaceChildren(error);
}

export function renderAlbumNotFound() {
  const section = element("section", "not-found");
  const link = document.createElement("a");
  link.href = "/music/";
  link.textContent = "Back to Music";
  section.append(element("h1", "", "Album Not Found"), link);
  document.querySelector("#album-container").replaceChildren(section);
}
