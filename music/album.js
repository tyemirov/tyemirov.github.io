const MUSIC_DATA_URL = "../../data/music.json";

document.addEventListener("DOMContentLoaded", () => {
  void hydrateAlbumPage();
});

async function hydrateAlbumPage() {
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
    const slug = window.location.pathname.split("/").filter(Boolean).pop();
    const album = musicData.items.find(item => item.slug === slug);

    if (album) {
      renderAlbum(album);
    } else {
      renderNotFound();
    }
    renderFooter();
  } catch (error) {
    console.error("Unable to load album data.", error);
  }
}

function renderAlbum(album) {
  document.title = `${album.title} | Vadym Tyemirov`;
  
  const container = document.getElementById("album-container");
  if (!container) return;

  container.innerHTML = `
    <article class="album-detail">
      <div class="album-layout">
        <aside class="album-sidebar">
          <div class="album-cover-large">
            <img src="${album.coverImage || "/music/covers/placeholder.jpg"}" alt="${album.title} cover">
          </div>
          <div class="streaming-links">
            <p class="links-label">Listen on:</p>
            <div class="links-grid">
              ${renderStreamingLinks(album.streamingLinks)}
            </div>
          </div>
        </aside>

        <div class="album-content">
          <header class="album-header">
            <h1 class="album-title-large">${album.displayTitle || album.title}</h1>
            ${album.translation ? `<p class="album-translation-large">${album.translation}</p>` : ""}
            <p class="album-meta-large">${album.latest ? `<span style="color: var(--copper)">Latest Release</span> • ` : ""}${album.releaseDate} • ${album.trackCount} Tracks</p>
          </header>

          <section class="album-notes">
            <p class="lead-text">${album.subtitle || ""}</p>
            <div class="notes-body">
              ${album.notes || "<p>Album notes coming soon.</p>"}
            </div>
          </section>

          ${album.trackList ? `
            <section class="tracklist-section">
              <h2 class="section-subtitle">Track List</h2>
              <ol class="track-list">
                ${album.trackList.map(track => `<li>${track}</li>`).join("")}
              </ol>
            </section>
          ` : ""}

          ${album.credits ? `
            <section class="credits-section">
              <h2 class="section-subtitle">Credits</h2>
              <div class="credits-body">
                ${album.credits}
              </div>
            </section>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderStreamingLinks(links) {
  if (!links) return "";
  const platforms = [
    { key: "spotify", label: "Spotify" },
    { key: "apple", label: "Apple Music" },
    { key: "youtube", label: "YouTube Music" },
    { key: "amazon", label: "Amazon Music" }
  ];

  return platforms
    .filter(p => links[p.key])
    .map(p => `<a href="${links[p.key]}" target="_blank" class="streaming-link">${p.label}</a>`)
    .join("");
}

function renderNotFound() {
  const container = document.getElementById("album-container");
  if (container) {
    container.innerHTML = `
      <div class="not-found">
        <h1>Album Not Found</h1>
        <p>Sorry, the album you are looking for does not exist.</p>
        <a href="/music" class="button">Back to Music</a>
      </div>
    `;
  }
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
