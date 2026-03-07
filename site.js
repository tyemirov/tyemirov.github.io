const SITE_DATA_URL = "data/site.json";

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
  renderProjects(siteData.projects);
  renderNote(siteData.note);
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

  projectGrid.replaceChildren(...liveProjects.map(createProjectCard));
}

function renderNote(note) {
  if (!note || typeof note !== "object") {
    return;
  }

  updateText(".notes-label", note.label);
  updateText(".notes-copy", note.body);
}

function createHeroLink(link) {
  const anchor = document.createElement("a");
  anchor.className = link.style === "secondary" ? "button button-secondary" : "button";
  anchor.href = link.href || "#";
  anchor.textContent = link.label || "Open";
  return anchor;
}

function createProjectCard(project) {
  const card = document.createElement("a");
  const themeClass = project.theme ? ` project-card-${project.theme}` : "";
  card.className = `project-card${themeClass}`;
  card.href = project.href || (project.slug ? `${project.slug}/` : "#");

  const kicker = document.createElement("p");
  kicker.className = "card-kicker";
  kicker.textContent = project.kicker || "";

  const title = document.createElement("h2");
  title.textContent = project.title || project.slug || "Untitled";

  const summary = document.createElement("p");
  summary.className = "card-body";
  summary.textContent = project.summary || "";

  const cta = document.createElement("p");
  cta.className = "card-cta";
  cta.textContent = project.cta || `Open ${card.href}`;

  card.append(kicker, title, summary, cta);
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
