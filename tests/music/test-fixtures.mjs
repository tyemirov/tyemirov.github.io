// @ts-check
import { test as base, expect } from "@playwright/test";

// Silence the test audio output while preserving real loading, decoding, and time progression.
export const test = base.extend({
  silentAudio: [async ({ context }, use) => {
    await context.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        this.muted = true;
        return play.apply(this, args);
      };
    });
    await use();
  }, { auto: true }],
  mediaDiagnostics: [async ({ context }, use, testInfo) => {
    await context.addInitScript(() => {
      globalThis.musicMediaEvents = [];
      for (const name of ["error", "abort", "emptied", "loadstart", "canplay", "playing", "seeking", "seeked", "pause"]) {
        document.addEventListener(name, (event) => {
          const audio = event.target;
          if (!(audio instanceof HTMLMediaElement)) return;
          globalThis.musicMediaEvents.push({ event: name, time: performance.now(), position: audio.currentTime, paused: audio.paused,
            readyState: audio.readyState, networkState: audio.networkState, error: audio.error ? { code: audio.error.code, message: audio.error.message } : null });
          if (globalThis.musicMediaEvents.length > 100) globalThis.musicMediaEvents.shift();
        }, true);
      }
    });
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const page of context.pages()) {
        await testInfo.attach("media-events", { body: JSON.stringify(await page.evaluate(() => globalThis.musicMediaEvents), null, 2), contentType: "application/json" });
      }
    }
  }, { auto: true }],
});
export { expect };
