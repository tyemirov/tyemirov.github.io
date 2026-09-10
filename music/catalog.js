// @ts-check

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const PLATFORMS = Object.freeze({ spotify: "Spotify", apple: "Apple Music", youtube: "YouTube Music", amazon: "Amazon Music", suno: "Suno" });

/** @typedef {{kind: "external"} | {kind: "hls", durationMs: number}} Playback */
/** @typedef {{id: string, title: string, playback: Playback}} Track */
/** @typedef {{slug: string, title: string, displayTitle?: string, translation?: string, subtitle: string, coverImage: string, releaseDate: string, status: "live" | "draft", latest?: boolean, shortDescription: string, streamingLinks: Record<string,string>, tracks: Track[], credits: string, notes: string, order: number}} Album */
/** @typedef {{label: string, title: string, items: Album[]}} Music */

function object(value, keys, subject) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${subject} has an invalid shape.`);
  }
}

function text(value, subject) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${subject} requires text.`);
}

/** Validate the publication boundary without changing authored display text. @returns {Music} */
export function validateMusic(value) {
  object(value, ["label", "title", "items"], "Music");
  text(value.label, "Music label"); text(value.title, "Music title");
  if (!Array.isArray(value.items)) throw new Error("Music requires an album list.");
  const slugs = new Set(), trackIds = new Set();
  for (const album of value.items) {
    object(album, ["slug", "title", "displayTitle", "translation", "subtitle", "coverImage", "releaseDate", "status", "latest", "shortDescription", "streamingLinks", "tracks", "credits", "notes", "order"], "Album");
    for (const key of ["slug", "title", "subtitle", "coverImage", "releaseDate", "shortDescription", "credits", "notes"]) text(album[key], `Album ${key}`);
    if (!ID.test(album.slug) || slugs.has(album.slug)) throw new Error("Album slugs must be valid and unique.");
    slugs.add(album.slug);
    if (!["live", "draft"].includes(album.status) || !Number.isSafeInteger(album.order) || album.order < 0) throw new Error("Album publication data is invalid.");
    if (album.latest !== undefined && typeof album.latest !== "boolean") throw new Error("Album latest must be boolean.");
    for (const key of ["displayTitle", "translation"]) if (album[key] !== undefined) text(album[key], `Album ${key}`);
    if (!/^\/music\/covers\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(album.coverImage)) throw new Error("Album cover path is invalid.");
    object(album.streamingLinks, Object.keys(PLATFORMS), "Platform links");
    if (!Object.keys(album.streamingLinks).length) throw new Error("Album requires explicit platform links.");
    for (const href of Object.values(album.streamingLinks)) {
      text(href, "Platform URL");
      const url = new URL(href);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Platform URL must use HTTPS.");
    }
    if (!Array.isArray(album.tracks)) throw new Error("Album requires tracks.");
    for (const track of album.tracks) {
      object(track, ["id", "title", "playback"], "Track");
      text(track.id, "Track ID"); text(track.title, "Track title");
      if (!ID.test(track.id) || trackIds.has(track.id)) throw new Error("Track IDs must be valid and unique.");
      trackIds.add(track.id);
      if (track.playback?.kind === "external") object(track.playback, ["kind"], "External playback");
      else if (track.playback?.kind === "hls") {
        object(track.playback, ["kind", "durationMs"], "HLS playback");
        if (!Number.isSafeInteger(track.playback.durationMs) || track.playback.durationMs < 1000 || track.playback.durationMs > 7200250) throw new Error("Track duration is invalid.");
      } else throw new Error("Track playback kind is invalid.");
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
