// @ts-check
import { readFileSync } from "node:fs";
import { test, expect } from "./test-fixtures.mjs";

const music = JSON.parse(readFileSync(new URL("./catalog.expected.json", import.meta.url), "utf8"));

for (const album of music.items) {
  test(`every recording on ${album.slug} plays from its bundled audio file`, async ({ page, context }) => {
    await context.addCookies([{ name: "music-fixture", value: "recordings", domain: "localhost", path: "/" }]);
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    await page.goto(`/music/${album.slug}/`);
    await expect(page.locator("button[data-play-track]")).toHaveCount(album.tracks.length);
    for (const track of album.tracks) {
      const grantResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/music/playback-grants"));
      await page.locator(`button[data-play-track="${track.id}"]`).click();
      const response = await grantResponse;
      expect(response.status()).toBe(201);
      const grant = await response.json();
      expect(grant.trackId).toBe(track.id);
      expect(grant.durationMs).toBe(track.playback.durationMs);
      const audio = page.locator("#music-player audio");
      await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
      expect(await audio.evaluate(element => element.error)).toBeNull();
      await page.getByRole("region", { name: "Music player" }).getByRole("button", { name: "Pause", exact: true }).click();
    }
  });
}
