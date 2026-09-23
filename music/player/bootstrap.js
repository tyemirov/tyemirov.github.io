// @ts-check
import { createPlaybackAPI } from "./api.js";
import { PlayerController } from "./controller.js";
import { mountPlayerView } from "./view.js";
import { connectMediaSession } from "./media-session.js";

let initialization;
export async function initializePlayer(album) {
  initialization ??= createPlayer(album);
  const controller = await initialization;
  for (const track of album.tracks) controller.trackAlbums.set(track.id, album);
  for (const button of document.querySelectorAll("button[data-play-track]")) button.disabled = false;
  controller.changed();
}

async function createPlayer(album) {
  const response = await fetch("/config-site.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Player configuration is unavailable.");
  const api = createPlaybackAPI(await response.json());
  const audio = document.createElement("audio");
  audio.preload = "none";
  const controller = new PlayerController(audio, api, album);
  const disposeView = mountPlayerView(controller, audio);
  const disposeMediaSession = connectMediaSession(controller);
  for (const button of document.querySelectorAll("button[data-play-track]")) button.disabled = false;
  const pagehide = (event) => {
    if (event.persisted) return;
    window.removeEventListener("pagehide", pagehide);
    disposeMediaSession();
    controller.dispose();
    disposeView();
  };
  window.addEventListener("pagehide", pagehide);
  return controller;
}
