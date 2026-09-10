// @ts-check

import { musicCatalog } from "../assets/js/generated/validators.js";
export const PLATFORMS = Object.freeze({ spotify: "Spotify", apple: "Apple Music", youtube: "YouTube Music", amazon: "Amazon Music", suno: "Suno" });

/** @typedef {{kind: "external"} | {kind: "hls", durationMs: number}} Playback */
/** @typedef {{id: string, title: string, playback: Playback}} Track */
/** @typedef {import('../contracts/generated/musicCatalog').MusicCatalog} Music */
/** @typedef {Music['items'][number]} Album */

/** Validate the music transport boundary. @returns {Music} */
export function validateMusic(value) {
  if (!musicCatalog(value)) throw new Error(`Validate music: ${JSON.stringify(musicCatalog.errors)}`);
  const slugs = new Set(), tracks = new Set();
  for (const album of value.items) {
    if (slugs.has(album.slug)) throw new Error('Duplicate album slug.');
    slugs.add(album.slug);
    for (const track of album.tracks) {
      if (tracks.has(track.id)) throw new Error('Duplicate track ID.');
      tracks.add(track.id);
    }
  }
  return value;
}

/** @param {Music} music */
export function playbackAllowlist(music) {
  return { tracks: music.items.flatMap((album) => album.tracks.map(({ id, playback }) => ({
    id, playback: album.status === "live" ? playback : { kind: "external" },
  }))) };
}
