const MUSIC_DATA_URL = "../data/music.json";

document.addEventListener("DOMContentLoaded", () => {
  void hydrateMusicPage();
});

async function hydrateMusicPage() {
  try {
    const response = await fetch(MUSIC_DATA_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${MUSIC_DATA_URL}: ${response.status}`);
    }

    const musicData = await response.json();
    renderAlbumGrid(musicData.items);
    renderFooter();
  } catch (error) {
    console.error("Unable to load music data.", error);
  }
}

function renderAlbumGrid(albums) {
  const grid = document.getElementById("album-grid");
  if (!grid || !Array.isArray(albums)) return;

  const sorted = albums.filter(a => !a.status || a.status === "live").sort((a, b) => (a.order || 999) - (b.order || 999));
  grid.replaceChildren(...sorted.map(createAlbumCard));
}

function createAlbumCard(album) {
  const card = document.createElement("div");
  card.className = "album-card";

  const cover = document.createElement("div");
  cover.className = "album-cover";
  const img = document.createElement("img");
  img.src = album.coverImage || "/music/covers/placeholder.jpg";
  img.alt = `${album.title} cover`;
  img.loading = "lazy";
  cover.append(img);

  const title = document.createElement("h2");
  title.className = "album-title";
  title.textContent = album.displayTitle || album.title;

  card.append(cover, title);

  if (album.translation) {
    const translation = document.createElement("p");
    translation.className = "album-translation";
    translation.textContent = album.translation;
    card.append(translation);
  }

  const meta = document.createElement("p");
  meta.className = "album-meta";
  if (album.latest) {
    const latest = document.createElement("span");
    latest.textContent = "Latest Release • ";
    latest.style.color = "var(--copper)";
    meta.append(latest);
  }
  meta.append(`${album.releaseDate || ""} • ${album.trackCount || 0} Tracks`);
  card.append(meta);

  const desc = document.createElement("p");
  desc.className = "album-description";
  desc.textContent = album.subtitle || album.shortDescription;
  card.append(desc);

  const actions = document.createElement("div");
  actions.className = "album-actions";
  
  const listenBtn = document.createElement("a");
  listenBtn.className = "listen-button";
  listenBtn.href = album.streamingLinks?.spotify || "#";
  listenBtn.target = "_blank";
  listenBtn.textContent = "Listen";
  
  const detailsBtn = document.createElement("a");
  detailsBtn.className = "listen-button button-secondary";
  detailsBtn.href = `/music/${album.slug}`;
  detailsBtn.textContent = "Album Notes";

  actions.append(listenBtn, detailsBtn);
  card.append(actions);

  return card;
}

function renderFooter() {
  const footer = document.querySelector("#site-footer");
  if (!footer) return;

  const initFooter = () => {
    footer.setAttribute("size", "small");
    footer.setAttribute("privacy-link-hidden", "true");
    footer.setAttribute("theme-toggle", "true");
  };

  footer.addEventListener("theme-change", (e) => {
    const isDark = e.detail.value === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  });

  if (globalThis.MPRUI) initFooter();
  else window.addEventListener("mpr-ui-ready", initFooter, { once: true });
}
