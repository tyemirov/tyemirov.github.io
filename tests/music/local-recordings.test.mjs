// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { chromium, webkit, expect } from "@playwright/test";
import { installSharedUIAssets } from "./shared-ui-assets.mjs";
import { installCapabilityScenario } from "./browser-capabilities.mjs";

const siteOrigin = `http://localhost:${process.env.UP_PORT}`;
const mediaOrigin = `http://localhost:${process.env.API_PORT}`;
const albumSlug = "soliloquies-vol-ii";
const canonical = JSON.parse(await readFile(new URL("../../data/site.json", import.meta.url), "utf8"));
const album = canonical.music.items.find(album => album.slug === albumSlug);

function get(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks), headers: response.headers }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error(`Read ${new URL(url).pathname}: timeout`)));
    req.end();
  });
}

test("the local service plays all nine supplied Vol. II recordings with protected media", { timeout: 180000 }, async () => {
  assert.equal((await get(mediaOrigin + "/music/readyz")).status, 200);
  const response = await get(siteOrigin + "/data/site.json");
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const served = JSON.parse(response.body).music.items.find(album => album.slug === albumSlug);
  assert.deepEqual(served.tracks.map(track => [track.id, track.title]), album.tracks.map(track => [track.id, track.title]));
  assert.equal(served.tracks.length, 9);
  const selected = JSON.parse(await readFile(`${process.env.MUSIC_LOCAL_ROOT}/selected.json`, "utf8"));
  for (const track of served.tracks) {
    assert.equal(track.playback.kind, "hls");
    assert.equal(track.playback.durationMs, selected.tracks[track.id].durationMs);
    assert.ok(track.playback.durationMs > 13000, "The local catalog must contain the supplied recording, not the generated test tone.");
  }
  const results = [];
  for (const [engine, browserType] of [["hls.js", chromium], ["native HLS", webkit]]) {
    const browser = await browserType.launch({ headless: true, ...(engine === "hls.js" ? { channel: "chromium" } : {}) });
    try {
      const context = await browser.newContext();
      await installSharedUIAssets(context);
      await installCapabilityScenario(context, { project: { metadata: { forceHls: engine === "hls.js" } }, annotations: [] });
      await context.route(/loopaware\.mprlab\.com/, route => route.abort());
      await context.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function (...args) { this.muted = true; return play.apply(this, args); };
      });
      const page = await context.newPage();
      await page.goto(siteOrigin + "/");
      await expect(page.locator(`.music-list a[href="/music/${albumSlug}/"]`)).toBeVisible();
      await page.goto(siteOrigin + "/music/");
      await expect(page.locator(".album-card")).toHaveCount(canonical.music.items.length);
      await page.locator(`.album-card a[href="/music/${albumSlug}/"]`).click();
      await expect(page.locator(".track-title")).toHaveText(album.tracks.map(track => track.title));
      const audio = page.locator("#music-player audio");
      for (const track of served.tracks) {
        const grantResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url() === mediaOrigin + "/music/playback-grants");
        await page.locator(`button[data-play-track="${track.id}"]`).click();
        const granted = await grantResponse;
        assert.equal(granted.status(), 201, `Create playback grant for ${track.id}`);
        const grant = await granted.json();
        await expect(page.locator(`[data-track-id="${track.id}"]`)).toHaveAttribute("aria-current", "true");
        try {
          await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(3);
        } catch (error) {
          console.error(JSON.stringify({ trackId: track.id, engine, player: await page.locator("#music-player").innerText(), audio: await audio.evaluate(element => ({ native: element.canPlayType("application/vnd.apple.mpegurl"), readyState: element.readyState, networkState: element.networkState, error: element.error?.message, paused: element.paused })) }));
          throw error;
        }
        const state = await audio.evaluate(element => ({ muted: element.muted, error: element.error, time: element.currentTime }));
        assert.equal(state.muted, true);
        assert.equal(state.error, null);
        assert.equal(await audio.evaluate(element => element.currentSrc.startsWith("blob:")), engine === "hls.js");
        assert.equal((await get(grant.playlistUrl)).status, 401);
        results.push({ trackId: track.id, engine, seconds: state.time, anonymousPlaylistStatus: 401 });
        await page.getByRole("region", { name: "Music player" }).getByRole("button", { name: "Pause", exact: true }).click();
      }
      await page.goto(siteOrigin + "/");
      await context.close();
    } finally { await browser.close(); }
  }
  await mkdir("output/playwright", { recursive: true });
  await writeFile("output/playwright/volii-local-playback.json", JSON.stringify({ siteOrigin, mediaOrigin, results }, null, 2) + "\n");
});
