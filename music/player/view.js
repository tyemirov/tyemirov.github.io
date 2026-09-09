// @ts-check
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function mountPlayerView(controller, audio) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const region = document.createElement("section");
  region.id = "music-player";
  region.className = "music-player";
  region.setAttribute("aria-label", "Music player");
  region.hidden = true;
  region.innerHTML = `<div class="player-summary"><img class="player-cover" alt="Album cover"><div><strong class="player-track"></strong><p class="player-album"></p></div></div>
    <div class="player-controls"><button type="button" data-action="previous" aria-label="Previous track">Previous</button><button type="button" data-action="toggle">Play</button><button type="button" data-action="next" aria-label="Next track">Next</button><button type="button" data-action="retry" hidden>Retry</button></div>
    <div class="player-progress"><label for="music-seek">Seek</label><input id="music-seek" type="range" min="0" max="1" step="1" value="0"><span class="player-time" aria-live="off"></span></div>
    <label class="player-volume" for="music-volume">Volume <input id="music-volume" type="range" min="0" max="1" step="0.05" value="1"></label>
    <p class="player-status" role="status" aria-live="polite"></p><p class="player-error" role="alert" hidden></p>`;
  region.append(audio);
  document.body.insertBefore(region, document.querySelector("mpr-footer"));
  const find = (selector) => region.querySelector(selector);
  const initialVolume = audio.volume;
  audio.volume = initialVolume === 1 ? 0.5 : 1;
  find(".player-volume").hidden = audio.volume === initialVolume;
  audio.volume = initialVolume;
  const toggle = find('[data-action="toggle"]'), retry = find('[data-action="retry"]');
  const seek = find("#music-seek");
  const actions = {
    previous: () => controller.previous(), next: () => controller.next(), retry: () => controller.retry(),
    toggle: () => { if (["playing", "buffering"].includes(controller.phase)) controller.pause(); else void controller.resume(); },
  };
  region.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) actions[button.dataset.action]();
  }, options);
  seek.addEventListener("input", () => controller.seek(Number(seek.value)), options);
  find("#music-volume").addEventListener("input", (event) => controller.setVolume(Number(event.target.value)), options);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-play-track]");
    if (button) void controller.select(button.dataset.playTrack);
  }, options);

  const render = () => {
    const state = controller.snapshot();
    region.hidden = !state.track;
    if (!state.track) return;
    const busy = ["authorizing", "loading"].includes(state.phase);
    find(".player-track").textContent = state.track.title;
    find(".player-album").textContent = state.album.displayTitle ?? state.album.title;
    find(".player-cover").src = state.album.coverImage;
    toggle.textContent = ["playing", "buffering"].includes(state.phase) ? "Pause" : "Play";
    toggle.disabled = busy || state.phase === "error";
    find('[data-action="previous"]').disabled = !state.previous;
    find('[data-action="next"]').disabled = !state.next;
    retry.hidden = state.phase !== "error";
    retry.disabled = state.retryDelay > 0;
    find("#music-volume").value = String(state.volume);
    seek.disabled = busy || state.phase === "error";
    seek.max = String(state.duration);
    seek.value = String(state.position);
    seek.setAttribute("aria-valuetext", `${formatTime(state.position)} of ${formatTime(state.duration)}`);
    find(".player-time").textContent = `${formatTime(state.position)} / ${formatTime(state.duration)}`;
    const status = find(".player-status"), error = find(".player-error");
    error.hidden = state.phase !== "error";
    if (state.phase === "error") {
      if (error.textContent !== state.message) error.textContent = state.message;
      if (status.textContent) status.textContent = "";
    } else {
      error.textContent = "";
      if (status.textContent !== state.message) status.textContent = state.message;
    }
    for (const row of document.querySelectorAll(".track-row")) {
      if (row.dataset.trackId === state.track.id) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  };
  controller.addEventListener("change", render, options);
  render();
  return () => { events.abort(); region.remove(); };
}
