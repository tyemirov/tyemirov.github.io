// @ts-check
import { test, expect } from "./test-fixtures.mjs";


test("protected AAC plays, seeks, and renews without replacing the source", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  const responses = [];
  page.on("response", (response) => { if (response.url().includes("/audio/")) responses.push(response); });
  await page.goto("/fixture/");
  await page.getByRole("button", { name: "Play test tone", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Playing");
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(1);
  await expect(page.locator("#engine")).toHaveText("native");
  const mediaURL = await page.locator("#mediaURL").textContent();
  const cookies = await context.cookies("https://localhost:18444/music");
  expect(cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: "__Secure-music-session", httpOnly: true, secure: true, sameSite: "Strict", path: "/music" })]));
  expect(await page.evaluate(() => document.cookie)).not.toContain("__Secure-music-session");
  expect(await page.locator("audio").evaluate((audio) => audio.muted)).toBe(true);
  const source = await page.locator("audio").evaluate((audio) => audio.currentSrc);
  await page.locator("audio").evaluate((audio) => { audio.currentTime = 7; });
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(7.2);
  await page.getByRole("button", { name: "Renew access" }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("Access renewed");
  expect(await page.locator("#mediaURL").textContent()).toBe(mediaURL);
  expect(await page.locator("audio").evaluate((audio) => audio.currentSrc)).toBe(source);
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(8);
  expect(responses.some(response => response.url().endsWith(".m4a") && response.ok())).toBe(true);
  expect(responses.every((response) => response.ok())).toBe(true);
  test.info().annotations.push({ type: "browser-version", description: page.context().browser().version() });
  test.info().annotations.push({ type: "playback-engine", description: await page.locator("#engine").textContent() });
});

test("a copied audio URL requires the owning session", async ({ page, context, playwright }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.goto("/fixture/");
  await page.getByRole("button", { name: "Play test tone", exact: true }).click();
  await expect(page.locator("#mediaURL")).toContainText("/audio/");
  const mediaURL = await page.locator("#mediaURL").textContent();
  const anonymous = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  const other = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  try {
    expect((await other.post("https://localhost:18444/music/playback-grants", {
      headers: { Origin: "https://localhost:18443" }, data: { trackId: "test-tone" },
    })).status()).toBe(201);
    for (const url of [mediaURL]) {
      for (const method of ["GET", "HEAD"]) {
        expect((await anonymous.fetch(url, { method })).status()).toBe(401);
        expect((await other.fetch(url, { method })).status()).toBe(404);
        expect((await context.request.fetch(url, { method })).status()).toBe(200);
      }
    }
  } finally { await anonymous.dispose(); await other.dispose(); }
});
