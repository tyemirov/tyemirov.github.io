const SITE_DATA_URL = "data/site.json";

let currentFilter = null;
let allProjects = [];

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

    const siteData = await response.json();
    allProjects = siteData.projects || [];
    renderSite(siteData);
  } catch (error) {
    console.error("Unable to load site data, leaving static fallback in place.", error);
  }
}

function renderSite(siteData) {
  if (!siteData || typeof siteData !== "object") {
    return;
  }

  renderSiteMeta(siteData.site);
  renderHero(siteData.hero);
  renderProfile(siteData.profile);
  renderArticles(siteData.articles);
  renderArts(siteData.arts);
  renderProjects(allProjects);
  renderFooter();
}

function renderSiteMeta(site) {
  if (!site || typeof site !== "object") {
    return;
  }

  if (site.title) {
    document.title = site.title;
  }

  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag && site.description) {
    descriptionTag.setAttribute("content", site.description);
  }

  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag && site.canonical) {
    canonicalTag.setAttribute("href", site.canonical);
  }
}

function renderHero(hero) {
  if (!hero || typeof hero !== "object") {
    return;
  }

  updateText(".eyebrow", hero.eyebrow);
  updateText(".hero-copy h1", hero.title);
  updateText(".hero-copy .lead", hero.summary);
  updateText(".hero-copy .lead-secondary", hero.detail);

  const links = Array.isArray(hero.links)
    ? hero.links
        .filter((link) => !link.status || link.status === "live")
        .sort(byOrder)
    : [];

  if (!links.length) {
    return;
  }

  const heroLinks = document.querySelector(".hero-links");
  if (!heroLinks) {
    return;
  }

  heroLinks.replaceChildren(...links.map(createHeroLink));
}

function renderProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return;
  }

  const profileCard = document.querySelector(".profile-card");
  if (profileCard && profile.ariaLabel) {
    profileCard.setAttribute("aria-label", profile.ariaLabel);
  }

  updateText(".profile-name", profile.name);
  updateText(".profile-role", profile.role);
  updateText(".profile-footnote", profile.footnote);

  const picture = document.querySelector(".profile-photo");
  const source = picture?.querySelector("source");
  const img = picture?.querySelector("img");
  const image = profile.image || {};
  const webp = image.webp || {};
  const jpg = image.jpg || {};

  if (source && webp.srcset) {
    source.setAttribute("srcset", webp.srcset);
    source.setAttribute("type", webp.type || "image/webp");
    if (profile.sizes) {
      source.setAttribute("sizes", profile.sizes);
    }
  }

  if (img) {
    if (jpg.src) {
      img.setAttribute("src", jpg.src);
    }
    if (jpg.srcset) {
      img.setAttribute("srcset", jpg.srcset);
    }
    if (profile.sizes) {
      img.setAttribute("sizes", profile.sizes);
    }
    if (jpg.width) {
      img.setAttribute("width", String(jpg.width));
    }
    if (jpg.height) {
      img.setAttribute("height", String(jpg.height));
    }
    if (profile.alt) {
      img.setAttribute("alt", profile.alt);
    }
  }
}

function renderProjects(projects) {
  if (!Array.isArray(projects)) {
    return;
  }

  const liveProjects = projects
    .filter((project) => !project.status || project.status === "live")
    .sort(byOrder);

  if (!liveProjects.length) {
    return;
  }

  const projectGrid = document.querySelector(".project-grid");
  if (!projectGrid) {
    return;
  }

  const renderGrid = (filterTag = null) => {
    const filtered = filterTag
      ? liveProjects.filter((p) => p.kicker === filterTag)
      : liveProjects;

    projectGrid.replaceChildren(...filtered.map(createProjectCard));
  };

  window.toggleProjectFilter = (tag) => {
    if (currentFilter === tag) {
      currentFilter = null;
    } else {
      currentFilter = tag;
    }
    renderGrid(currentFilter);
    
    if (currentFilter) {
      projectGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  renderGrid(currentFilter);
}

function renderArticles(articles) {
  if (!articles || typeof articles !== "object") {
    return;
  }

  const items = Array.isArray(articles.items)
    ? articles.items
        .filter((article) => !article.status || article.status === "live")
        .sort(byOrder)
    : [];

  if (!items.length) {
    return;
  }

  updateText(".writing-section .notes-label", articles.label);
  updateText(".writing-section .section-title", articles.title);

  const writingSection = document.querySelector(".writing-section");
  const articleList = document.querySelector(".article-list");
  if (!writingSection || !articleList) {
    return;
  }

  articleList.replaceChildren(...items.map(createArticleCard));
  writingSection.classList.remove("is-hidden");
}

function renderArts(arts) {
  if (!arts || typeof arts !== "object") {
    return;
  }

  const items = Array.isArray(arts.items)
    ? arts.items
        .filter((item) => !item.status || item.status === "live")
        .sort(byOrder)
    : [];

  if (!items.length) {
    return;
  }

  updateText(".arts-section .notes-label", arts.label);
  updateText(".arts-section .section-title", arts.title);

  const artsSection = document.querySelector(".arts-section");
  const artsList = document.querySelector(".arts-list");
  if (!artsSection || !artsList) {
    return;
  }

  artsList.replaceChildren(...items.map(createArticleCard));
  artsSection.classList.remove("is-hidden");
}

function renderFooter() {
  const footer = document.querySelector("#site-footer");
  if (!footer) {
    return;
  }

  const footerProjects =
    typeof globalThis.MPRUI?.getFooterSiteCatalog === "function"
      ? globalThis.MPRUI.getFooterSiteCatalog()
      : [];

  footer.setAttribute("sticky", "false");
  footer.setAttribute("size", "small");
  footer.setAttribute("privacy-link-hidden", "true");
  footer.setAttribute("inner-class", "site-footer__inner");
  footer.setAttribute("wrapper-class", "site-footer__layout");
  footer.removeAttribute("horizontal-links");

  if (footerProjects.length > 0) {
    footer.setAttribute(
      "links-collection",
      JSON.stringify({
        style: "drop-up",
        text: "Built by Marco Polo Research Lab",
        links: footerProjects
      })
    );
  } else {
    footer.removeAttribute("links-collection");
  }
}

function createHeroLink(link) {
  const anchor = document.createElement("a");
  anchor.className = link.style === "secondary" ? "button button-secondary" : "button";
  anchor.href = link.href || "#";
  if (link.target) {
    anchor.target = link.target;
  }
  if (link.target === "_blank") {
    anchor.rel = "noopener noreferrer";
  }
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
  kicker.title = `Filter by ${project.kicker}`;
  kicker.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.toggleProjectFilter(project.kicker);
  };

  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.className = "project-title-link";
  titleLink.href = project.href || (project.slug ? `${project.slug}/` : "#");
  titleLink.textContent = project.title || project.slug || "Untitled";
  title.append(titleLink);

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = project.summary || "";

  card.append(kicker, title, summary);

  if (Array.isArray(project.parts) && project.parts.length > 0) {
    const partsList = document.createElement("ul");
    partsList.className = "project-parts-list";
    project.parts.forEach((part) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = part.url || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = part.label || "Read more";
      item.append(link);
      partsList.append(item);
    });
    card.append(partsList);
  }

  if (project.essay?.url) {
    card.append(createProjectEssayLink(project.essay));
  }

  const actions = document.createElement("div");
  actions.className = "project-actions";

  const projectLink = document.createElement("a");
  projectLink.className = "project-link";
  projectLink.href = project.href || (project.slug ? `${project.slug}/` : "#");
  projectLink.textContent = project.cta || `Open ${projectLink.href}`;
  actions.append(projectLink);

  card.append(actions);
  return card;
}

function createProjectEssayLink(essay) {
  const link = document.createElement("a");
  link.className = "project-essay-link";
  link.href = essay.url || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const label = document.createElement("span");
  label.className = "project-essay-label";
  label.textContent = essay.label || "Companion essay";

  const title = document.createElement("span");
  title.className = "project-essay-title";
  title.textContent = essay.title || essay.url || "Read the essay";

  link.append(label, title);
  return link;
}

function createArticleCard(article) {
  const card = document.createElement("a");
  card.className = "article-card";
  card.href = article.url || "#";
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const meta = document.createElement("button");
  meta.className = "article-meta-tag";
  meta.textContent = article.source || "Writing";
  meta.title = `Filter by ${meta.textContent}`;
  meta.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.toggleProjectFilter(meta.textContent);
  };

  const title = document.createElement("h3");
  title.className = "article-title";
  title.textContent = article.title || "Untitled";

  const cta = document.createElement("p");
  cta.className = "article-cta";
  cta.textContent = article.cta || "Read";

  card.append(meta, title, cta);
  return card;
}

function updateText(selector, value) {
  if (!value) {
    return;
  }

  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function byOrder(left, right) {
  return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
}
