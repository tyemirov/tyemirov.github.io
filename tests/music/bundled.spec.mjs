// @ts-check
import { test, expect } from "./test-fixtures.mjs";

test("every published recording plays from its bundled audio file", async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  await context.addCookies([{ name: "music-fixture", value: "recordings", domain: "localhost", path: "/" }]);
  await context.route(/loopaware\.mprlab\.com/, route => route.abort());
  const site = await (await context.request.get("/data/site.json")).json();
  let played = 0;
  for (const album of site.music.items) {
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
      played++;
    }
  }
  expect(played).toBe(60);
});
