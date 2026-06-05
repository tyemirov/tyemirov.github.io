const SITE_DATA_URL = "data/site.json";
const MUSIC_DATA_URL = "data/music.json";

let currentFilter = null;
let siteData = null;
let musicData = null;

document.addEventListener("DOMContentLoaded", () => {
  void hydrateHomePage();
});

async function hydrateHomePage() {
  try {
    const [siteRes, musicRes] = await Promise.all([
      fetch(SITE_DATA_URL, { headers: { Accept: "application/json" } }),
      fetch(MUSIC_DATA_URL, { headers: { Accept: "application/json" } })
    ]);

    if (!siteRes.ok) throw new Error(`Failed to load ${SITE_DATA_URL}: ${siteRes.status}`);
    if (!musicRes.ok) throw new Error(`Failed to load ${MUSIC_DATA_URL}: ${musicRes.status}`);

    siteData = await siteRes.json();
    musicData = await musicRes.json();
    renderAll(siteData, musicData);
  } catch (error) {
    console.error("Unable to load site data, leaving static fallback in place.", error);
  }
}

function renderAll(data, music) {
  if (!data || typeof data !== "object") return;

  renderSiteMeta(data.site);
  renderHero(data.hero);
  renderProfile(data.profile);
  renderProjects(data.mprlab);
  renderEssays(data.essays);
  renderMusic(music);
  renderArts(data.arts);
  renderFooter(data.contact);
}

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

function renderProjects(mprlab) {
  const projectSection = document.querySelector(".project-section");
  if (!projectSection || !mprlab) return;

  updateText(".project-section .section-blurb .lead", mprlab.blurb);
  projectSection.classList.remove("is-hidden");
}

function renderEssays(essays) {
  const essaySection = document.querySelector(".essay-section");
  const essayList = document.querySelector(".essay-list");
  if (!essaySection || !essayList || !essays) return;

  const filtered = (essays.items || []).filter(liveOnly).sort(byOrder).slice(0, 4);
  
  updateText(".essay-section .notes-label", essays.label);
  updateText(".essay-section .section-title", essays.title);
  
  essayList.replaceChildren(...filtered.map(createArticleCard));
  essaySection.classList.remove("is-hidden");
}

function renderMusic(music) {
  const musicSection = document.querySelector(".music-section");
  const musicList = document.querySelector(".music-list");
  if (!musicSection || !musicList || !music) return;

  const items = (music.items || []).filter(liveOnly).sort(byOrder).slice(0, 3);
  
  updateText(".music-section .notes-label", music.label);
  updateText(".music-section .section-title", music.title);
  
  musicList.replaceChildren(...items.map(createMusicItem));
  musicSection.classList.remove("is-hidden");
}

function renderArts(arts) {
  const artsSection = document.querySelector(".arts-section");
  if (!artsSection || !arts) return;

  const item = (arts.items || []).find(liveOnly);
  if (item) {
    updateText(".arts-section .section-blurb .lead", item.summary);
  }

  updateText(".arts-section .notes-label", arts.label);
  updateText(".arts-section .section-title", arts.title);

  artsSection.classList.remove("is-hidden");
}

window.toggleProjectFilter = (tag) => {
  currentFilter = (currentFilter === tag) ? null : tag;
  renderAll(siteData, musicData);
  if (currentFilter) {
    document.querySelector(".essay-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

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

  const kicker = document.createElement("button");
  kicker.className = "card-kicker-tag";
  kicker.textContent = project.kicker || "";
  kicker.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.toggleProjectFilter(project.kicker); };

  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "project-title-link";
  titleLink.href = project.href || "#";
  titleLink.textContent = project.title || "Untitled";
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = project.summary || "";

  card.append(kicker, title, summary);

  if (Array.isArray(project.parts)) {
    const list = document.createElement("ul");
    list.className = "project-parts-list";
    project.parts.forEach(part => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = part.url;
      a.target = "_blank";
      a.textContent = part.label;
      li.append(a);
      list.append(li);
    });
    card.append(list);
  }

  const actions = document.createElement("div");
  actions.className = "project-actions";
  const link = document.createElement("a");
  link.className = "project-link";
  link.href = project.href || "#";
  link.textContent = project.cta || link.href;
  actions.append(link);
  card.append(actions);

  return card;
}

function createProjectEssayLink(essay) {
  const link = document.createElement("a");
  link.className = "project-essay-link";
  link.href = essay.url;
  link.target = "_blank";
  const label = document.createElement("span");
  label.className = "project-essay-label";
  label.textContent = essay.label || "Companion essay";
  const title = document.createElement("span");
  title.className = "project-essay-title";
  title.textContent = essay.title;
  link.append(label, title);
  return link;
}

function createArticleCard(article) {
  const card = document.createElement("article");
  card.className = "project-card";

  const kicker = document.createElement("p");
  kicker.className = "card-kicker-tag";
  kicker.textContent = article.kicker || article.source || "Essay";

  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = article.url;
  titleLink.target = "_blank";
  titleLink.textContent = article.title;
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = article.summary || "";

  const actions = document.createElement("div");
  actions.className = "project-actions";
  const link = document.createElement("a");
  link.className = "project-link";
  link.href = article.url;
  link.target = "_blank";
  link.textContent = article.cta || "Read on Substack";
  actions.append(link);

  card.append(kicker, title, summary, actions);
  return card;
}

function createMusicItem(item) {
  const card = document.createElement("a");
  card.className = "article-card music-card";
  card.href = `/music/${item.slug}`;

  const cover = document.createElement("div");
  cover.className = "music-card-cover";
  const img = document.createElement("img");
  img.src = item.coverImage || "/music/covers/placeholder.jpg";
  img.alt = `${item.title} cover`;
  img.loading = "lazy";
  cover.append(img);

  const meta = document.createElement("p");
  meta.className = "article-meta-tag";
  meta.textContent = item.latest ? "Latest Release" : (item.releaseDate || "Music");
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
  if (el && value) el.textContent = value;
}

function liveOnly(item) { return !item.status || item.status === "live"; }
function byOrder(a, b) { return (a.order || 999) - (b.order || 999); }

function renderFooter(contact) {
  const footer = document.querySelector("#site-footer");
  if (!footer) return;

  const initFooter = () => {
    if (typeof globalThis.MPRUI?.getFooterSiteCatalog === "function") {
      const links = globalThis.MPRUI.getFooterSiteCatalog();
      const footerLinks = Array.isArray(links) ? [...links] : [];
      if (contact?.href && contact?.label) {
        footerLinks.push({ label: contact.label, url: contact.href });
      }
      if (footerLinks.length) {
        footer.setAttribute("links-collection", JSON.stringify({
          style: "drop-up",
          text: "Built by Marco Polo Research Lab",
          links: footerLinks
        }));
      }
    }
    footer.setAttribute("size", "small");
    footer.setAttribute("privacy-link-hidden", "true");
    footer.setAttribute("inner-class", "site-footer__inner");
    footer.setAttribute("wrapper-class", "site-footer__layout");
    footer.setAttribute("theme-toggle", "true");
  };

  footer.addEventListener("theme-change", (e) => {
    const isDark = e.detail.value === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  });

  if (globalThis.MPRUI) initFooter();
  else window.addEventListener("mpr-ui-ready", initFooter, { once: true });
}
