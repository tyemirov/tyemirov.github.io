// @ts-check
import { PlaybackError } from "./api.js";

const AUDIO_TYPE = 'audio/mp4; codecs="mp4a.40.2"';

/** @typedef {{kind: "native", load(url: string, position?: number): Promise<void>, stop(): void, destroy(): void}} PlaybackEngine */

/**
 * Select one engine for the document and keep its media requests credentialed.
 * @param {HTMLAudioElement} audio
 * @param {(error: Error) => void} onFailure
 * @returns {PlaybackEngine}
 */
export function createPlaybackEngine(audio, onFailure) {
  audio.crossOrigin = "use-credentials";
  audio.preload = "none";
  if (!audio.canPlayType(AUDIO_TYPE)) throw new PlaybackError("unsupported_browser");
  /** @type {((error: Error) => void) | null} */
  let rejectLoad = null;

  const fail = (error) => {
    if (rejectLoad) { const reject = rejectLoad; rejectLoad = null; reject(error); }
    else onFailure(error);
  };
  const mediaError = () => fail(new Error(`Audio playback failed (${audio.error?.code}).`));
  audio.addEventListener("error", mediaError);

  function clearSource() {
    if (rejectLoad) { rejectLoad(new DOMException("Track selection changed.", "AbortError")); rejectLoad = null; }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  return {
    kind: "native",
    stop: clearSource,
    load(url, position = 0) {
      clearSource();
      return new Promise((resolve, reject) => {
        audio.preload = "auto";
        const finish = (error) => {
          clearTimeout(timeout);
          audio.removeEventListener("canplay", ready);
          audio.removeEventListener("seeked", ready);
          rejectLoad = null;
          if (error) reject(error); else resolve();
        };
        let positionSet = false;
        const ready = () => {
          if (!positionSet) {
            positionSet = true;
            if (audio.currentTime !== position) audio.currentTime = position;
          }
          if (!audio.seeking && audio.readyState >= 3) finish(null);
        };
        const timeout = setTimeout(() => finish(new Error("Music loading timed out.")), 30000);
        rejectLoad = finish;
        audio.addEventListener("canplay", ready);
        audio.addEventListener("seeked", ready);
        audio.src = url;
        audio.load();
      });
    },
    destroy() {
      audio.removeEventListener("error", mediaError);
      clearSource();
    },
  };
}
