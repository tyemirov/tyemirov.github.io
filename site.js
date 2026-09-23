// @ts-check
import { navigate, initializePage, onPageLeave } from "/assets/js/navigation.js";
import { initializeSiteFooter } from "./assets/js/footer.js";
import { validatePublicCatalog } from "./assets/js/catalog.js";
import { renderMusicIndex, renderAlbumDetails, renderMusicError, renderAlbumNotFound } from "./music/render.js";
import { orderedArtworks } from "./gallery/js/core/catalog.js";

import { siteTopics } from "./assets/js/generated/routes.js";

const SITE_DATA_URL = "/data/site.json";

let siteData = null;
/** @type {AbortController | null} */
let homepageRequest = null;

export async function mountPage() {
  if (!document.body.classList.contains("home")) return;
  onPageLeave(() => homepageRequest?.abort());
  await hydrateHomePage();
}
initializePage(mountPage);
window.addEventListener("pageshow", event => {
  if (event.persisted) void mountPage();
});
window.addEventListener("pagehide", event => {
  if (!event.persisted) homepageRequest?.abort();
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
        if (album.tracks.some((track) => track.playback.kind === "file")) {
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
    await restoreSectionScroll(request.signal);
  } catch (error) {
    if (request.signal.aborted) return;
    renderMusicError("Music is unavailable. Please reload the page.");
    document.querySelector(".music-section").classList.remove("is-hidden");
    console.error("Site catalog failed.", error);
  } finally {
    if (homepageRequest === request) homepageRequest = null;
  }
}

/** @param {AbortSignal} signal */
async function restoreSectionScroll(signal) {
  if (!location.hash) return;
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  }
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(resolve));
  if (signal.aborted) return;
  const section = document.getElementById(location.hash.slice(1));
  if (section?.matches('main > section')) section.scrollIntoView({ behavior: 'instant' });
}

function renderAll(data) {
  if (!data || typeof data !== "object") return;

  renderSiteMeta(data.site);
  renderHero(data.hero);
  renderProfile(data.profile);
  window.toggleProjectFilter = topic => {
    if (!siteTopics.includes(topic)) throw new Error(`Unknown content topic: ${topic}`);
    const url = new URL('/articles/', location.origin);
    url.searchParams.set('topic', topic);
    void navigate(url);
  };
  renderContent(data);
  void initializeSiteFooter({ contact: data.contact, themeAttribute: "data-theme" });
}

function renderContent(data) {
  renderEssays(data.articles);
  renderMusic(data.music);
  renderArts(data.gallery);
  renderTools(data.tools);
}

function createFilterButton(tag, label) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'card-kicker-tag';
  button.textContent = label; button.dataset.filterTag = tag;
  button.addEventListener('click', () => window.toggleProjectFilter(tag));
  return button;
}
function itemTag(item) { return item.kicker; }

function renderSiteMeta(site) {
  if (!site) return;
  if (site.title) document.title = site.title;
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && site.description) descriptionTag.setAttribute("content", site.description);
  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag && site.canonical) canonicalTag.setAttribute("href", site.canonical);
}

function renderHero(hero) {
  if (!hero) return;
  updateText(".eyebrow", hero.eyebrow);
  updateText(".hero-copy h1", hero.title);
  updateText(".hero-copy .lead", hero.summary);
  updateText(".hero-copy .lead-secondary", hero.detail);

  const links = (hero.links || []).filter(liveOnly).sort(byOrder);
  const heroLinks = document.querySelector(".hero-links");
  if (heroLinks) heroLinks.replaceChildren(...links.map(createHeroLink));
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

function renderEssays(essays) {
  const essaySection = document.querySelector(".essay-section");
  const essayList = document.querySelector(".essay-list");
  if (!essaySection || !essayList || !essays) return;

  const filtered = (essays.items || []).filter(liveOnly).sort(byOrder).slice(0, 4);
  
  updateText(".essay-section .section-title", essays.title);
  
  essayList.replaceChildren(...filtered.map(article => createArticleCard(article, null)));
  const projects = siteData.projects.filter(liveOnly).sort(byOrder);
  essaySection.querySelector('.project-list').replaceChildren(...projects.map(project => createProjectCard(project, essays.items, null)));
  essaySection.classList.toggle("is-hidden", filtered.length === 0 && projects.length === 0);
}

function renderMusic(music) {
  const musicSection = document.querySelector(".music-section");
  const musicList = document.querySelector(".music-list");
  if (!musicSection || !musicList || !music) return;

  const items = (music.items || []).filter(liveOnly).sort(byOrder).slice(0, 3);
  
  updateText(".music-section .section-title", music.label);
  
  musicList.replaceChildren(...items.map(createMusicItem));
  musicSection.classList.toggle("is-hidden", items.length === 0);
}

function renderArts(arts) {
  const artsSection = document.querySelector(".arts-section");
  if (!artsSection || !arts) return;

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

  updateText(".arts-section .section-title", arts.title);

  artsSection.classList.remove("is-hidden");
}

/** @param {import('./contracts/generated/publicCatalog').PublicCatalog["tools"]} tools */
function renderTools(tools) {
  const section = document.querySelector(".tools-section");
  const toolsList = section?.querySelector(".tools-list");
  if (!section || !toolsList || !tools) return;

  updateText(".tools-section .section-title", tools.title);

  const platformCard = createToolCard({
    titleText: tools.platform.title,
    summaryText: tools.platform.summary,
    tagText: "Platform",
    link: tools.platform.link,
    extraCardClass: "platform-card",
  });

  const gameCards = (tools.games?.items || []).map((game) =>
    createToolCard({
      titleText: game.title,
      summaryText: game.summary,
      tagText: game.status,
      tagClass: "game-status",
      icon: game.icon,
      link: game.link,
      extraCardClass: "game-card",
    })
  );

  toolsList.replaceChildren(platformCard, ...gameCards);
  section.classList.remove("is-hidden");
}

/**
 * @param {{
 *   titleText: string;
 *   summaryText?: string;
 *   tagText?: string;
 *   tagClass?: string;
 *   icon?: string;
 *   link?: { label?: string; href?: string; target?: string; style?: "primary" | "secondary" };
 *   extraCardClass?: string;
 * }} options
 */
function createToolCard({ titleText, summaryText, tagText, tagClass, icon, link, extraCardClass }) {
  const card = document.createElement("article");
  card.className = `project-card tool-card${extraCardClass ? ` ${extraCardClass}` : ""}`;

  if (icon) {
    const image = document.createElement("img");
    image.className = "game-icon";
    image.src = icon;
    image.alt = "";
    image.width = 48;
    image.height = 48;
    image.loading = "lazy";
    card.append(image);
  }

  if (tagText) {
    const tags = document.createElement("div");
    tags.className = "card-tags";
    const tag = document.createElement("p");
    tag.className = `card-kicker-tag${tagClass ? ` ${tagClass}` : ""}`;
    tag.textContent = tagText;
    tags.append(tag);
    card.append(tags);
  }

  const title = document.createElement("h2");
  if (link?.href) {
    const titleLink = document.createElement("a");
    titleLink.href = link.href;
    if (link.target) titleLink.target = link.target;
    if (link.target === "_blank") titleLink.rel = "noopener noreferrer";
    titleLink.textContent = titleText;
    title.append(titleLink);
  } else {
    title.textContent = titleText;
  }

  const summary = document.createElement("p");
  summary.className = "card-body game-summary";
  summary.textContent = summaryText || "";

  card.append(title, summary);

  return card;
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

function createProjectCard(project, articles, selectedTopic) {
  const card = document.createElement("article");
  const themeClass = project.theme ? ` project-card-${project.theme}` : "";
  const activeClass = selectedTopic === project.kicker ? " is-active" : "";
  card.className = `project-card${themeClass}${activeClass}`;

  const kicker = createFilterButton(project.kicker, project.kicker);
  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "project-title-link";
  titleLink.href = project.kind === "model" ? project.href : `/articles/${articles.find(article => article.id === project.parts[0].articleId).slug}/`;
  titleLink.textContent = project.title || "Untitled";
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = project.summary || "";

  const tags=document.createElement('div'); tags.className='card-tags'; if (selectedTopic !== project.kicker) tags.append(kicker);
  card.append(tags, title, summary);

  if (Array.isArray(project.parts)) {
    const list = document.createElement("ul");
    list.className = "project-parts-list";
    project.parts.forEach(part => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      const article = articles.find(item => item.id === part.articleId);
      a.href = `/articles/${article.slug}/`;
      a.textContent = article.title;
      li.append(a);
      list.append(li);
    });
    card.append(list);
  }

  if (project.kind === "model") {
    const actions = document.createElement("div");
    actions.className = "project-actions";
    actions.append(createCardAction("Explore interactive tool", project.href), createCardAction("Read companion article", project.sourceUrl));
    card.append(actions);
  }

  return card;
}

export function renderArticleIndex(site, selectedTopic) {
  const matches = item => selectedTopic === null || item.kicker === selectedTopic;
  const articles = site.articles.items.filter(liveOnly).filter(matches).sort(byOrder);
  const projects = site.projects.filter(liveOnly).filter(matches).sort(byOrder);
  document.querySelector('#article-list').replaceChildren(
    ...articles.map(article => createArticleCard(article, selectedTopic)),
    ...projects.map(project => createProjectCard(project, site.articles.items, selectedTopic)),
  );
  document.querySelector('.topic-empty').hidden = articles.length + projects.length > 0;
}

function createArticleCard(article, selectedTopic) {
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
  if (selectedTopic !== article.kicker) tags.append(kicker);
  card.append(tags, title, summary);
  const actions = document.createElement("div");
  actions.className = "project-actions";
  actions.append(createCardAction("Read article", `/articles/${article.slug}/`), createCardAction(`Read on ${article.source.label}`, article.source.url));
  card.append(actions);
  return card;
}

/** @param {string} label @param {string} href */
function createCardAction(label, href) {
  const link = document.createElement("a");
  link.className = "project-link";
  link.href = href;
  link.textContent = label;
  return link;
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
