// @ts-check
import { test, expect } from "./test-fixtures.mjs";
import { installCapabilityScenario } from "./browser-capabilities.mjs";

test.beforeEach(async ({ context }, testInfo) => {
  await installCapabilityScenario(context, testInfo);
  await context.addCookies([{ name: "music-fixture", value: "player", domain: "localhost", path: "/" }]);
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
});

test("the album player supports playback, pause, seeking, and the local queue", async ({ page }) => {
  await page.goto("/music/soliloquies-vol-i/");
  const tracks = page.locator(".track-play");
  await expect(tracks).toHaveCount(2);
  await tracks.first().click();
  const player = page.getByRole("region", { name: "Music player" });
  await expect(player).toBeVisible();
  const audio = player.locator("audio");
  await expect(audio).toHaveCount(1);
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(1);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => audio.evaluate((element) => element.paused)).toBe(true);
  await player.getByLabel("Seek").fill("7");
  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(7);
  await player.getByRole("button", { name: "Next track" }).click();
  await expect(player.locator(".player-track")).toHaveText("To be, or not to be (Hamlet)");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.2);
  await expect(player.getByRole("button", { name: "Next track" })).toBeDisabled();
  await audio.evaluate((element) => { element.currentTime = element.duration - 0.1; });
  await expect(player.locator('[role="status"]')).toHaveText("Album finished.");
  await expect.poll(() => audio.evaluate((element) => element.paused)).toBe(true);
  await expect(page.getByRole("link", { name: "Spotify", exact: true })).toBeVisible();
});

test("cold playback starts within three seconds at 10 Mbps and 100 ms latency", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-hls", "Chromium CDP qualifies the hls.js network path.");
  await page.goto("/music/soliloquies-vol-i/");
  await expect(page.locator(".track-play")).toHaveCount(2);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const appliedRules = [];
  cdp.on("Network.requestWillBeSentExtraInfo", (event) => {
    if (event.appliedNetworkConditionsId) appliedRules.push(event.appliedNetworkConditionsId);
  });
  const { ruleIds } = await cdp.send("Network.emulateNetworkConditionsByRule", {
    matchedNetworkConditions: [{ urlPattern: "https://localhost:18444/*", latency: 100,
      downloadThroughput: 1250000, uploadThroughput: 1250000 }],
  });
  await page.evaluate(() => {
    globalThis.musicStartup = { started: null, elapsed: null };
    document.addEventListener("click", (event) => {
      if (event.target.closest(".track-play")) globalThis.musicStartup.started = performance.now();
    }, { capture: true, once: true });
    document.addEventListener("playing", () => {
      globalThis.musicStartup.elapsed = performance.now() - globalThis.musicStartup.started;
    }, { capture: true, once: true });
  });
  await page.locator(".track-play").first().click();
  await expect.poll(() => page.evaluate(() => globalThis.musicStartup.elapsed)).toBeGreaterThan(0);
  const elapsed = await page.evaluate(() => globalThis.musicStartup.elapsed);
  expect(elapsed).toBeLessThan(3000);
  expect(appliedRules.filter((id) => ruleIds.includes(id)).length).toBeGreaterThanOrEqual(4);
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
  testInfo.annotations.push({ type: "network-startup", description: JSON.stringify({ elapsedMs: elapsed, downloadMbps: 10, latencyMs: 100 }) });
  await cdp.detach();
});

test("a later track selection owns the player after a delayed grant response", async ({ page, context }) => {
  await context.route("**/api/playback-grants", async (route) => {
    if (route.request().postDataJSON().trackId.endsWith("-01")) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  await page.goto("/music/soliloquies-vol-i/");
  const tracks = page.locator(".track-play");
  await tracks.first().click();
  await tracks.nth(1).click();
  const player = page.getByRole("region", { name: "Music player" });
  await expect(player.locator(".player-track")).toHaveText("To be, or not to be (Hamlet)");
  await expect.poll(() => player.locator("audio").evaluate((element) => element.currentTime)).toBeGreaterThan(1);
  await expect(page.locator("audio")).toHaveCount(1);
  await expect(page.locator('.track-row[aria-current="true"] .track-title')).toHaveText("To be, or not to be (Hamlet)");
});

test("an invalid API playlist produces Retry before any media request", async ({ page, context }) => {
  let mediaRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/hls/")) mediaRequests++; });
  await context.route("**/api/playback-grants", async (route) => {
    const response = await route.fetch();
    const grant = await response.json();
    grant.playlistUrl = "https://untrusted.example/index.m3u8";
    await route.fulfill({ response, json: grant });
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const player = page.getByRole("region", { name: "Music player" });
  await expect(player.getByRole("alert")).toContainText("Playback is unavailable");
  await expect(player.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
  expect(mediaRequests).toBe(0);
});

test("resume replaces one lost grant and preserves the paused position", async ({ page, context }) => {
  let creations = 0, reads = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/playback-grants")) creations++; });
  await context.route("**/api/playback-grants/*", async (route) => {
    if (route.request().method() === "GET" && reads++ === 0) await route.fulfill({ status: 401, json: { error: { code: "session_required", message: "Session expired.", requestId: "AAAAAAAAAAAAAAAA" } } });
    else await route.continue();
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const player = page.getByRole("region", { name: "Music player" });
  const audio = player.locator("audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await player.getByLabel("Seek").fill("6");
  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(6.2);
  expect(creations).toBe(2);
  expect(reads).toBe(1);
});

test("a playing grant near expiry renews without changing the source", async ({ page, context }) => {
  let renewed;
  await context.route("**/api/playback-grants", async (route) => {
    const response = await route.fetch();
    const grant = await response.json();
    grant.expiresAt = new Date(Date.parse(grant.serverTime) + 60000).toISOString();
    await route.fulfill({ response, json: grant });
  });
  page.on("request", (request) => { if (request.method() === "PUT" && request.url().endsWith("/expiration")) renewed = request.postDataJSON(); });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const audio = page.locator("#music-player audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  const source = await audio.evaluate((element) => element.currentSrc);
  await expect.poll(() => renewed?.expiresAt).toBeTruthy();
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(1);
  expect(await audio.evaluate((element) => element.currentSrc)).toBe(source);
});

test("Retry honors the server delay without an automatic request loop", async ({ page, context }) => {
  let creations = 0;
  await context.route("**/api/playback-grants", async (route) => {
    if (++creations === 1) await route.fulfill({ status: 429, headers: { "Retry-After": "2", "Access-Control-Expose-Headers": "Retry-After" }, json: { error: { code: "rate_limited", message: "Too many requests.", requestId: "AAAAAAAAAAAAAAAA" } } });
    else await route.continue();
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const player = page.getByRole("region", { name: "Music player" });
  const retry = player.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeDisabled();
  await expect(player.getByRole("alert")).toContainText("Try again in");
  await expect(retry).toBeEnabled({ timeout: 4000 });
  expect(creations).toBe(1);
  await retry.click();
  await expect.poll(() => player.locator("audio").evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  expect(creations).toBe(2);
});

test("repeated authorization failure stops after one replacement", async ({ page, context }) => {
  let creations = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/playback-grants")) creations++; });
  await context.route("**/hls/**", (route) => route.fulfill({ status: 410, headers: { "Access-Control-Allow-Origin": "https://localhost:18443", "Access-Control-Allow-Credentials": "true" }, json: { error: { code: "grant_expired", message: "Expired.", requestId: "AAAAAAAAAAAAAAAA" } } }));
  await context.route("**/api/playback-grants/*", async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ status: 410, json: { error: { code: "grant_expired", message: "Expired.", requestId: "AAAAAAAAAAAAAAAA" } } });
    else await route.continue();
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  await expect(page.locator("#music-player").getByRole("alert")).toContainText("Playback is unavailable");
  expect(creations).toBe(2);
  await expect(page.locator("#music-player").getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
});

for (const scenario of ["configuration", "unsupported browser"]) {
  test(`${scenario} failure preserves album content and platform links`, async ({ page, context }) => {
    if (scenario === "configuration") await context.route("**/music/player-config.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    else await context.addInitScript(() => {
      HTMLMediaElement.prototype.canPlayType = () => "";
      Object.defineProperty(window, "MediaSource", { value: undefined });
      Object.defineProperty(window, "ManagedMediaSource", { value: undefined });
    });
    await page.goto("/music/soliloquies-vol-i/");
    await expect(page.getByRole("alert")).toContainText(scenario === "configuration" ? "Player is unavailable" : "This browser cannot play");
    await expect(page.locator(".track-row")).toHaveCount(8);
    await expect(page.getByRole("link", { name: "Spotify", exact: true })).toBeVisible();
    await expect(page.locator(".track-play").first()).toBeDisabled();
  });
}

test("media actions use the player controller and update album metadata", async ({ page, context }) => {
  await context.addInitScript(() => {
    window.mediaActions = {};
    Object.defineProperty(navigator, "mediaSession", { value: {
      metadata: null, playbackState: "none", setPositionState(state) { this.positionState = state; },
      setActionHandler(action, handler) { window.mediaActions[action] = handler; },
    } });
    window.MediaMetadata = class { constructor(data) { Object.assign(this, data); } };
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const audio = page.locator("#music-player audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("Inferno — Canto I");
  await page.evaluate(() => window.mediaActions.pause());
  await expect.poll(() => audio.evaluate((element) => element.paused)).toBe(true);
  await page.evaluate(() => window.mediaActions.seekto({ seekTime: 6 }));
  await page.evaluate(() => window.mediaActions.play());
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(6);
  await page.evaluate(() => window.mediaActions.nexttrack());
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("To be, or not to be (Hamlet)");
});

test("resume after a real service restart restores playback once", async ({ page, context }) => {
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const player = page.locator("#music-player"), audio = player.locator("audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await player.getByLabel("Seek").fill("6");
  expect((await context.request.post("/fixture-control/restart")).status()).toBe(204);
  let replacements = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/playback-grants")) replacements++; });
  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(6);
  expect(replacements).toBe(1);
});

test("two tabs recover from concurrent first-cookie creation", async ({ page, context }) => {
  const other = await context.newPage();
  let arrived = 0, release;
  const both = new Promise((resolve) => { release = resolve; });
  await context.route("**/api/playback-grants", async (route) => {
    if (++arrived <= 2) { if (arrived === 2) release(); await both; }
    await route.continue();
  });
  await Promise.all([page.goto("/music/soliloquies-vol-i/"), other.goto("/music/soliloquies-vol-i/")]);
  await Promise.all([page.locator(".track-play").first().click(), other.locator(".track-play").nth(1).click()]);
  for (const tab of [page, other]) await expect.poll(() => tab.locator("#music-player audio").evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  expect(arrived).toBeLessThanOrEqual(4);
  await other.close();
});

test("a successful body with the wrong HTTP status is rejected", async ({ page, context }) => {
  let mediaRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/hls/")) mediaRequests++; });
  await context.route("**/api/playback-grants", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, status: 202 });
  });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  await expect(page.locator("#music-player").getByRole("alert")).toContainText("Playback is unavailable");
  expect(mediaRequests).toBe(0);
});

test("volume controls follow the browser's actual volume capability", async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(HTMLMediaElement.prototype, "volume", { get() { return 1; }, set() {} }));
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  await expect(page.locator("#music-player")).toBeVisible();
  await expect(page.getByLabel("Volume", { exact: true })).toBeHidden();
});

test("the narrow player supports keyboard seeking and automatic track advance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().focus();
  await page.keyboard.press("Enter");
  const player = page.locator("#music-player"), audio = player.locator("audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(player.getByRole("status")).toHaveText("Paused.");
  await expect(player.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await expect(player.locator(".player-time")).toHaveAttribute("aria-live", "off");
  const seek = player.getByLabel("Seek");
  await seek.fill("6"); await seek.focus(); await page.keyboard.press("ArrowRight");
  expect(Number(await seek.inputValue())).toBeGreaterThanOrEqual(7);
  await expect(seek).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await player.getByRole("button", { name: "Play", exact: true }).click();
  await audio.evaluate((element) => { element.currentTime = element.duration - 0.1; });
  await expect(player.locator(".player-track")).toHaveText("To be, or not to be (Hamlet)");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.2);
  await expect(page.locator("mpr-footer")).toHaveAttribute("sticky", "false");
  await page.screenshot({ path: `output/playwright/music-narrow-${test.info().project.name}.png`, fullPage: true });
});

test("changing a track in one tab preserves the other tab's grant", async ({ page, context }) => {
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  await expect.poll(() => page.locator("audio").evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  const other = await context.newPage();
  await other.goto("/music/soliloquies-vol-i/");
  await other.locator(".track-play").first().click();
  await expect.poll(() => other.locator("audio").evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await other.locator("#music-player").getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("#music-player").getByRole("button", { name: "Next track" }).click();
  await expect(page.locator(".player-track")).toHaveText("To be, or not to be (Hamlet)");
  let replacements = 0;
  other.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/playback-grants")) replacements++; });
  await other.locator("#music-player").getByLabel("Seek").fill("6");
  await other.locator("#music-player").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => other.locator("audio").evaluate((element) => element.currentTime)).toBeGreaterThan(6);
  expect(replacements).toBe(0);
  await other.close();
});

test("a media error while paused defers recovery until Play", async ({ page }) => {
  await page.goto("/music/soliloquies-vol-i/");
  await page.locator(".track-play").first().click();
  const player = page.locator("#music-player"), audio = player.locator("audio");
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0.5);
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await player.getByLabel("Seek").fill("6");
  let reads = 0;
  page.on("request", (request) => { if (request.method() === "GET" && request.url().includes("/api/playback-grants/")) reads++; });
  await audio.evaluate((element) => element.dispatchEvent(new Event("error")));
  await expect(player.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  expect(reads).toBe(0);
  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(6);
  expect(reads).toBe(1);
});

test("reload releases only the departing document's grant across nine visits", async ({ page, context }) => {
  expect((await context.request.post("/fixture-control/restart")).status()).toBe(204);
  await context.unrouteAll({ behavior: "wait" });
  const other = await context.newPage();
  await other.goto("/music/soliloquies-vol-i/");
  const otherGrantResponse = other.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/playback-grants"));
  await other.locator(".track-play").first().click();
  const otherGrant = await (await otherGrantResponse).json();
  await expect.poll(() => other.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
  await other.locator("#music-player").getByRole("button", { name: "Pause", exact: true }).click();
  await page.goto("/music/soliloquies-vol-i/");
  const grantStatus = async (grant) => (await context.request.get(`https://localhost:18444/api/playback-grants/${grant.grantId}`, {
    headers: { Origin: "https://localhost:18443" },
  })).status();
  for (let visit = 0; visit < 9; visit++) {
    const response = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/playback-grants"));
    await page.locator(".track-play").first().click();
    const created = await response;
    expect(created.status()).toBe(201);
    const grant = await created.json();
    await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
    await page.reload();
    await expect.poll(() => grantStatus(grant)).toBe(410);
    expect(await grantStatus(otherGrant)).toBe(200);
  }
  await other.locator("#music-player").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => other.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(1);
  await other.close();
});

test("persisted page transitions preserve track controls and later disposal", async ({ page }) => {
  await page.goto("/music/soliloquies-vol-i/");
  await expect(page.locator(".track-play").first()).toBeEnabled();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.locator(".track-play").first().click();
  await expect(page.locator("#music-player")).toBeVisible();
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  await expect(page.locator("#music-player")).toHaveCount(0);
});

for (const resource of ["index.m3u8", "init.mp4", "seg-00000.m4s"]) {
  test(`HLS rate limits on ${resource} preserve the server cooldown`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-hls", "The hls.js request adapter owns HTTP error details.");
    let limitedRequests = 0, grantReads = 0;
    page.on("request", (request) => { if (request.method() === "GET" && request.url().includes("/api/playback-grants/")) grantReads++; });
    await context.route(`**/hls/**/${resource}`, async (route) => {
      limitedRequests++;
      await route.fulfill({ status: 429, headers: { "Retry-After": "60", "Access-Control-Expose-Headers": "Retry-After",
        "Access-Control-Allow-Origin": "https://localhost:18443", "Access-Control-Allow-Credentials": "true" },
      json: { error: { code: "rate_limited", message: "Too many requests.", requestId: "AAAAAAAAAAAAAAAA" } } });
    });
    await page.goto("/music/soliloquies-vol-i/");
    await page.clock.install();
    await page.locator(".track-play").first().click();
    const player = page.locator("#music-player"), retry = player.getByRole("button", { name: "Retry", exact: true });
    await expect(player.getByRole("alert")).toContainText("Try again in");
    await expect(retry).toBeDisabled();
    await page.clock.fastForward(59000);
    await expect(retry).toBeDisabled();
    expect(limitedRequests).toBe(1);
    expect(grantReads).toBe(0);
    await page.clock.fastForward(1000);
    await expect(retry).toBeEnabled();
    await context.unroute(`**/hls/**/${resource}`);
    await retry.click();
    await expect.poll(() => player.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
  });
}

test.describe("browser history cache", () => {
  test("a cached history return restores working playback controls", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-hls", "Chromium qualifies an actual back-forward cache restore.");
    await context.unrouteAll({ behavior: "wait" });
    await page.goto("/music/soliloquies-vol-i/");
    await expect(page.locator(".track-play").first()).toBeEnabled();
    await page.evaluate(() => {
      window.musicHistoryRestored = false;
      window.addEventListener("pageshow", (event) => { window.musicHistoryRestored = event.persisted; });
    });
    await page.goto("/healthz");
    await page.goBack({ waitUntil: "commit" });
    await expect.poll(() => page.evaluate(() => window.musicHistoryRestored)).toBe(true);
    await page.locator(".track-play").first().click();
    await expect(page.locator("#music-player")).toBeVisible();
    await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.2);
  });
});
