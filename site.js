const SITE_DATA_URL = "data/site.json";

let currentFilter = null;
let siteData = null;

document.addEventListener("DOMContentLoaded", () => {
  void hydrateHomePage();
});

async function hydrateHomePage() {
  try {
    const response = await fetch(SITE_DATA_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${SITE_DATA_URL}: ${response.status}`);
    }

    siteData = await response.json();
    renderAll(siteData);
  } catch (error) {
    console.error("Unable to load site data, leaving static fallback in place.", error);
  }
}

function renderAll(data) {
  if (!data || typeof data !== "object") return;

  renderSiteMeta(data.site);
  renderHero(data.hero);
  renderProfile(data.profile);
  renderArticles(data.articles);
  renderArts(data.arts);
  renderProjects(data.projects);
  renderFooter();
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

function renderProjects(projects) {
  const projectGrid = document.querySelector(".project-grid");
  if (!projectGrid || !Array.isArray(projects)) return;

  const filtered = projects.filter(liveOnly).sort(byOrder).filter(p => !currentFilter || p.kicker === currentFilter);
  projectGrid.replaceChildren(...filtered.map(createProjectCard));
}

function renderArticles(articles) {
  const writingSection = document.querySelector(".writing-section");
  const articleList = document.querySelector(".article-list");
  if (!writingSection || !articleList || !articles) return;

  const filtered = (articles.items || []).filter(liveOnly).sort(byOrder).filter(a => !currentFilter || a.source === currentFilter);
  
  updateText(".writing-section .notes-label", articles.label);
  updateText(".writing-section .section-title", articles.title);
  
  articleList.replaceChildren(...filtered.map(createArticleCard));
  writingSection.classList.toggle("is-hidden", filtered.length === 0 && !!currentFilter);
}

function renderArts(arts) {
  const artsSection = document.querySelector(".arts-section");
  const artsList = document.querySelector(".arts-list");
  if (!artsSection || !artsList || !arts) return;

  const filtered = (arts.items || []).filter(liveOnly).sort(byOrder).filter(a => !currentFilter || a.source === currentFilter);

  updateText(".arts-section .notes-label", arts.label);
  updateText(".arts-section .section-title", arts.title);

  artsList.replaceChildren(...filtered.map(createArticleCard));
  artsSection.classList.toggle("is-hidden", filtered.length === 0 && !!currentFilter);
}

window.toggleProjectFilter = (tag) => {
  currentFilter = (currentFilter === tag) ? null : tag;
  renderAll(siteData);
  if (currentFilter) {
    document.querySelector(".project-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (project.essay?.url) card.append(createProjectEssayLink(project.essay));

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
  const card = document.createElement("a");
  card.className = "article-card";
  card.href = article.url;
  card.target = "_blank";

  const meta = document.createElement("button");
  meta.className = "article-meta-tag";
  meta.textContent = article.source || "Writings";
  meta.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.toggleProjectFilter(article.source); };

  const title = document.createElement("h3");
  title.className = "article-title";
  title.textContent = article.title;

  const cta = document.createElement("p");
  cta.className = "article-cta";
  cta.textContent = article.cta || "Read";

  card.append(meta, title, cta);
  return card;
}

function updateText(selector, value) {
  const el = document.querySelector(selector);
  if (el && value) el.textContent = value;
}

function liveOnly(item) { return !item.status || item.status === "live"; }
function byOrder(a, b) { return (a.order || 999) - (b.order || 999); }

function renderFooter() {
  const footer = document.querySelector("#site-footer");
  if (!footer) return;

  const initFooter = () => {
    if (typeof globalThis.MPRUI?.getFooterSiteCatalog === "function") {
      const links = globalThis.MPRUI.getFooterSiteCatalog();
      if (links?.length) {
        footer.setAttribute("links-collection", JSON.stringify({
          style: "drop-up",
          text: "Built by Marco Polo Research Lab",
          links: links
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
