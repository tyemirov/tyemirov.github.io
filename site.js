// @ts-check
import { initializeSiteFooter } from "./assets/js/footer.js";
import { validatePublicCatalog } from "./assets/js/catalog.js";
import { renderMusicIndex, renderAlbumDetails, renderMusicError, renderAlbumNotFound } from "./music/render.js";
import { orderedArtworks } from "./gallery/js/core/catalog.js";

import { initializeTopics } from "./assets/js/topics.js";

let disposeTopics;
const SITE_DATA_URL = "/data/site.json";

let currentFilter = null;
let siteData = null;
/** @type {AbortController | null} */
let homepageRequest = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!document.querySelector(".hero")) return;
  void hydrateHomePage();
  window.addEventListener("pageshow", event => {
    if (event.persisted) void hydrateHomePage();
  });
  window.addEventListener("pagehide", event => {
    if (!event.persisted) homepageRequest?.abort();
  });
});

/** @param {AbortSignal} [signal] */
async function loadSite(signal) {
  const response = await fetch(SITE_DATA_URL, { signal, cache: "no-cache", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Failed to load the site catalog: ${response.status}`);
  const data = await response.json();
  return validatePublicCatalog(data);
}

/** @param {"index" | "album"} kind */
export async function hydrateMusicPage(kind) {
  try {
    const data = await loadSite();
    void initializeSiteFooter({ contact: data.contact, themeAttribute: "data-theme" });
    if (kind === "index") renderMusicIndex(data.music, data.contact);
    else {
      const slug = window.location.pathname.split("/").filter(Boolean).pop();
      const album = data.music.items.find((item) => item.slug === slug && item.status === "live");
      if (album) {
        renderAlbumDetails(album);
        if (album.tracks.some((track) => track.playback.kind === "hls")) {
          try {
            const { initializePlayer } = await import("./music/player/bootstrap.js");
            await initializePlayer(album);
          } catch (error) {
            const notice = document.createElement("p");
            notice.className = "music-error";
            notice.setAttribute("role", "alert");
            notice.textContent = error.code === "unsupported_browser"
              ? "This browser cannot play these tracks. Use a streaming link."
              : "Player is unavailable. Reload the page or use a streaming link.";
            document.querySelector(".tracklist-section").prepend(notice);
            console.error("Player startup failed.", error);
          }
        }
      }
      else renderAlbumNotFound();
    }
  } catch (error) {
    renderMusicError("Music is unavailable. Please reload the page.");
    console.error("Music catalog failed.", error);
  }
}

async function hydrateHomePage() {
  homepageRequest?.abort();
  const request = new AbortController();
  homepageRequest = request;
  try {
    siteData = await loadSite(request.signal);
    renderAll(siteData);
  } catch (error) {
    if (request.signal.aborted) return;
    renderMusicError("Music is unavailable. Please reload the page.");
    document.querySelector(".music-section").classList.remove("is-hidden");
    console.error("Site catalog failed.", error);
  } finally {
    if (homepageRequest === request) homepageRequest = null;
  }
}

function renderAll(data) {
  if (!data || typeof data !== "object") return;

  renderSiteMeta(data.site);
  renderHero(data.hero, data.software);
  renderProfile(data.profile);
  disposeTopics?.();
  disposeTopics = initializeTopics({ navigation: document.querySelector('.site-filters'), render: topic => {
    currentFilter = topic;
    renderContent(data);
  }});
  void initializeSiteFooter({ contact: data.contact, themeAttribute: "data-theme" });
}

function renderContent(data) {
  renderProjects(data.models);
  renderEssays(data.articles);
  renderMusic(data.music);
  renderArts(data.gallery);
  const heading = document.querySelector('.topic-heading');
  heading.hidden = currentFilter === null;
  heading.textContent = currentFilter || '';
  for (const section of document.querySelectorAll('main > section')) {
    section.querySelector('.section-heading').hidden = currentFilter !== null;
    section.querySelector('.section-actions').hidden = currentFilter !== null;
  }
  document.querySelector('.topic-empty').hidden = currentFilter === null || [...document.querySelectorAll('main > section')].some(section => !section.classList.contains('is-hidden'));
}

function createFilterButton(tag, label) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'card-kicker-tag';
  button.textContent = label; button.dataset.filterTag = tag;
  button.addEventListener('click', () => window.toggleProjectFilter(tag));
  return button;
}
function itemTag(item) { return item.kicker; }
function matchesFilter(item) { return currentFilter === null || currentFilter === itemTag(item); }

function renderSiteMeta(site) {
  if (!site) return;
  if (site.title) document.title = site.title;
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && site.description) descriptionTag.setAttribute("content", site.description);
  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag && site.canonical) canonicalTag.setAttribute("href", site.canonical);
}

function renderHero(hero, software) {
  if (!hero) return;
  updateText(".eyebrow", hero.eyebrow);
  updateText(".hero-copy h1", hero.title);
  updateText(".hero-copy .lead", hero.summary);
  updateText(".hero-copy .lead-secondary", hero.detail);

  const links = (hero.links || []).filter(liveOnly).sort(byOrder);
  const heroLinks = document.querySelector(".hero-links");
  if (heroLinks) heroLinks.replaceChildren(...links.map(createHeroLink), createHeroLink({ label: `${software.label} ↗`, href: software.href, target: "_blank", style: "secondary" }));
}

function renderProfile(profile) {
  if (!profile) return;
  const profileCard = document.querySelector(".profile-card");
  if (profileCard && profile.ariaLabel) profileCard.setAttribute("aria-label", profile.ariaLabel);
  updateText(".profile-name", profile.name);
  updateText(".profile-role", profile.role);
  updateText(".profile-footnote", profile.footnote);

  const img = document.querySelector(".profile-photo img");
  const source = document.querySelector(".profile-photo source");
  const image = profile.image || {};
  if (source && image.webp?.srcset) {
    source.setAttribute("srcset", image.webp.srcset);
    if (profile.sizes) source.setAttribute("sizes", profile.sizes);
  }
  if (img && image.jpg?.src) {
    img.setAttribute("src", image.jpg.src);
    img.setAttribute("srcset", image.jpg.srcset || "");
    if (profile.sizes) img.setAttribute("sizes", profile.sizes);
    if (profile.alt) img.setAttribute("alt", profile.alt);
  }
}

function renderProjects(models) {
  const projectSection = document.querySelector(".project-section");
  if (!projectSection || !models) return;

  updateText(".project-section .section-title", models.title);
  let cards = projectSection.querySelector('.project-list');
  if (!cards) { cards = document.createElement('div'); cards.className = 'project-list'; projectSection.append(cards); }
  const selected = siteData.projects.filter(project => matchesFilter(project)).sort(byOrder);
  cards.replaceChildren(...selected.map(createProjectCard));
  projectSection.classList.toggle('is-hidden', !selected.length);
}

function renderEssays(essays) {
  const essaySection = document.querySelector(".essay-section");
  const essayList = document.querySelector(".essay-list");
  if (!essaySection || !essayList || !essays) return;

  const filtered = (essays.items || []).filter(liveOnly).filter((item) => matchesFilter(item, essays)).sort(byOrder).slice(0, currentFilter === null ? 4 : undefined);
  
  updateText(".essay-section .notes-label", essays.label);
  updateText(".essay-section .section-title", essays.title);
  
  essayList.replaceChildren(...filtered.map(createArticleCard));
  essaySection.classList.toggle("is-hidden", filtered.length === 0);
}

function renderMusic(music) {
  const musicSection = document.querySelector(".music-section");
  const musicList = document.querySelector(".music-list");
  if (!musicSection || !musicList || !music) return;

  const items = (music.items || []).filter(liveOnly).filter((item) => matchesFilter(item, music)).sort(byOrder).slice(0, currentFilter === null ? 3 : undefined);
  
  updateText(".music-section .notes-label", music.label);
  updateText(".music-section .section-title", music.title);
  
  musicList.replaceChildren(...items.map(createMusicItem));
  musicSection.classList.toggle("is-hidden", items.length === 0);
}

function renderArts(arts) {
  const artsSection = document.querySelector(".arts-section");
  if (!artsSection || !arts) return;

  const item = currentFilter === null || currentFilter === "Arts";
  updateText(".arts-section .section-blurb .lead", arts.description);

  let previews = artsSection.querySelector(".arts-preview-list");
  if (!previews) {
    previews = document.createElement("div");
    previews.className = "arts-preview-list";
    artsSection.querySelector(".section-actions").before(previews);
  }
  const featured = new Map();
  for (const exhibit of siteData.gallery.exhibits) {
    for (const artwork of orderedArtworks(siteData.gallery, exhibit.sections.flatMap(section => section.artworkIds))) {
      if (!featured.has(artwork.id)) featured.set(artwork.id, { artwork, title: exhibit.title, href: `/gallery/exhibits/${encodeURIComponent(exhibit.id)}/` });
    }
  }
  for (const collection of siteData.gallery.collections) {
    for (const artwork of orderedArtworks(siteData.gallery, collection.artworkIds)) {
      if (!featured.has(artwork.id)) featured.set(artwork.id, { artwork, title: collection.title, href: `/gallery/collections/${encodeURIComponent(collection.id)}/` });
    }
  }
  previews.replaceChildren(...[...featured.values()].map(({ artwork, title, href }) => {
    const link = document.createElement("a");
    link.className = "arts-preview";
    link.href = href;
    link.setAttribute("aria-label", `${artwork.title} — ${title}`);
    const image = document.createElement("img");
    image.src = artwork.image.cardUrl;
    image.alt = artwork.alt;
    image.loading = "lazy";
    const caption = document.createElement("span");
    caption.textContent = artwork.title;
    link.append(image, caption);
    return link;
  }));

  updateText(".arts-section .notes-label", arts.label);
  updateText(".arts-section .section-title", arts.title);

  artsSection.classList.toggle("is-hidden", !item);
}

function createHeroLink(link) {
  const anchor = document.createElement("a");
  anchor.className = link.style === "secondary" ? "button button-secondary" : "button";
  anchor.href = link.href || "#";
  if (link.target) anchor.target = link.target;
  if (link.target === "_blank") anchor.rel = "noopener noreferrer";
  anchor.textContent = link.label || "Open";
  return anchor;
}

function createProjectCard(project) {
  const card = document.createElement("article");
  const themeClass = project.theme ? ` project-card-${project.theme}` : "";
  const activeClass = currentFilter === project.kicker ? " is-active" : "";
  card.className = `project-card${themeClass}${activeClass}`;

  const kicker = createFilterButton(project.kicker, project.kicker);
  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "project-title-link";
  titleLink.href = project.kind === "model" ? project.href : `/articles/${siteData.articles.items.find(article => article.id === project.parts[0].articleId).slug}/`;
  titleLink.textContent = project.title || "Untitled";
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = project.summary || "";

  const tags=document.createElement('div'); tags.className='card-tags'; if (currentFilter !== project.kicker) tags.append(kicker);
  card.append(tags, title, summary);

  if (Array.isArray(project.parts)) {
    const list = document.createElement("ul");
    list.className = "project-parts-list";
    project.parts.forEach(part => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      const article = siteData.articles.items.find(item => item.id === part.articleId);
      a.href = `/articles/${article.slug}/`;
      a.textContent = article.title;
      li.append(a);
      list.append(li);
    });
    card.append(list);
  }

  return card;
}

function createArticleCard(article) {
  const card = document.createElement("article");
  card.className = "project-card";

  const kicker = createFilterButton(itemTag(article), itemTag(article));

  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = `/articles/${article.slug}/`;
  titleLink.textContent = article.title;
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = article.summary || "";

  const tags = document.createElement('div'); tags.className = 'card-tags';
  if (currentFilter !== article.kicker) tags.append(kicker);
  card.append(tags, title, summary);
  return card;
}

function createMusicItem(item) {
  const card = document.createElement("a");
  card.className = "article-card music-card";
  card.href = `/music/${item.slug}/`;

  const cover = document.createElement("div");
  cover.className = "music-card-cover";
  const img = document.createElement("img");
  img.src = item.coverImage;
  img.alt = `${item.title} cover`;
  img.loading = "lazy";
  cover.append(img);

  const meta = document.createElement("p");
  meta.className = "article-meta-tag";
  meta.textContent = item.latest ? "Latest Release" : item.releaseDate.value;
  if (item.latest) meta.style.color = "var(--copper)";

  const title = document.createElement("h3");
  title.className = "article-title";
  title.textContent = item.title;

  const cta = document.createElement("p");
  cta.className = "article-cta";
  cta.textContent = "View Album";

  card.append(cover, meta, title, cta);
  return card;
}

function updateText(selector, value) {
  const el = document.querySelector(selector);
  if (el && value !== undefined) el.textContent = value;
}

function liveOnly(item) { return !item.status || item.status === "live"; }
function byOrder(a, b) { return a.order - b.order || String(a.id ?? a.slug ?? a.label).localeCompare(String(b.id ?? b.slug ?? b.label)); }
