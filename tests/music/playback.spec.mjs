// @ts-check
import { test, expect } from "./test-fixtures.mjs";
import { installCapabilityScenario } from "./browser-capabilities.mjs";

test.beforeEach(async ({ context }, testInfo) => {
  await installCapabilityScenario(context, testInfo);
});

test("protected HLS plays, seeks, and renews without replacing the source", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  const responses = [];
  page.on("response", (response) => { if (response.url().includes("/hls/")) responses.push(response); });
  await page.goto("/fixture/");
  await page.getByRole("button", { name: "Play test tone", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Playing");
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(1);
  const supportsNative = await page.locator("audio").evaluate((audio) => audio.canPlayType("application/vnd.apple.mpegurl") !== "");
  await expect(page.locator("#engine")).toHaveText(supportsNative ? "native" : "hls.js");
  const playlist = await page.locator("#playlist").textContent();
  const cookies = await context.cookies("https://localhost:18444/music");
  expect(cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "__Secure-music-session", httpOnly: true, secure: true, sameSite: "Strict", path: "/music" })]));
  expect(await page.evaluate(() => document.cookie)).not.toContain("__Secure-music-session");
  expect(await page.locator("audio").evaluate((audio) => audio.muted)).toBe(true);
  const source = await page.locator("audio").evaluate((audio) => audio.currentSrc);
  await page.locator("audio").evaluate((audio) => { audio.currentTime = 7; });
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(7.2);
  await page.getByRole("button", { name: "Renew access" }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Access renewed");
  expect(await page.locator("#playlist").textContent()).toBe(playlist);
  expect(await page.locator("audio").evaluate((audio) => audio.currentSrc)).toBe(source);
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(8);
  for (const suffix of ["index.m3u8", "init.mp4", "seg-00001.m4s"]) {
    expect(responses.some((response) => response.url().endsWith(suffix) && response.ok()), suffix).toBe(true);
  }
  expect(responses.every((response) => response.ok())).toBe(true);
  test.info().annotations.push({ type: "browser-version", description: page.context().browser().version() });
  test.info().annotations.push({ type: "playback-engine", description: await page.locator("#engine").textContent() });
});

test("a copied playlist and every referenced media file require the owning session", async ({ page, context, playwright }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.goto("/fixture/");
  await page.getByRole("button", { name: "Play test tone", exact: true }).click();
  await expect(page.locator("#playlist")).toContainText("/hls/");
  const playlist = await page.locator("#playlist").textContent();
  const anonymous = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  const other = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  try {
    expect((await other.post("https://localhost:18444/music/playback-grants", {
      headers: { Origin: "https://localhost:18443" }, data: { trackId: "test-tone" },
    })).status()).toBe(201);
    for (const name of ["index.m3u8", "init.mp4", "seg-00000.m4s", "seg-00001.m4s", "seg-00002.m4s"]) {
      const url = new URL(name, playlist).href;
      for (const method of ["GET", "HEAD"]) {
        expect((await anonymous.fetch(url, { method })).status()).toBe(401);
        expect((await other.fetch(url, { method })).status()).toBe(404);
        expect((await context.request.fetch(url, { method })).status()).toBe(200);
      }
    }
  } finally { await anonymous.dispose(); await other.dispose(); }
});
