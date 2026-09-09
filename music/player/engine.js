// @ts-check
import Hls from "hls.js";
import { PlaybackError, rateLimitError } from "./api.js";

const HLS_TYPE = "application/vnd.apple.mpegurl";

/** @typedef {{kind: "native" | "hls.js", load(url: string, position?: number): Promise<void>, stop(): void, destroy(): void}} PlaybackEngine */

/**
 * Select one engine for the document and keep its media requests credentialed.
 * @param {HTMLAudioElement} audio
 * @param {(error: Error) => void} onFailure
 * @returns {PlaybackEngine}
 */
export function createPlaybackEngine(audio, onFailure) {
  audio.crossOrigin = "use-credentials";
  audio.preload = "none";
  const native = audio.canPlayType(HLS_TYPE) !== "";
  if (!native && !Hls.isSupported()) throw new PlaybackError("unsupported_browser");
  /** @type {Hls | null} */
  let hls = null;
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
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  return {
    kind: native ? "native" : "hls.js",
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
        let positionSet = !native;
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
        if (native) {
          audio.src = url;
          audio.load();
          return;
        }
        hls = new Hls({
          startPosition: position,
          manifestLoadPolicy: { default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 30000, timeoutRetry: null, errorRetry: null } },
          playlistLoadPolicy: { default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 30000, timeoutRetry: null, errorRetry: null } },
          fragLoadPolicy: { default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 30000, timeoutRetry: null, errorRetry: null } },
          xhrSetup(xhr) { xhr.withCredentials = true; },
          fetchSetup(context, init) { return new Request(context.url, { ...init, credentials: "include" }); },
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.response?.code === 429) {
            const response = data.networkDetails;
            const retryAfter = response instanceof XMLHttpRequest ? response.getResponseHeader("Retry-After") : response?.headers?.get("Retry-After");
            fail(rateLimitError(retryAfter));
          } else fail(new Error(`Music stream failed: ${data.details}.`));
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
      });
    },
    destroy() {
      audio.removeEventListener("error", mediaError);
      clearSource();
    },
  };
}
