// @ts-check
import { readFileSync } from "node:fs";
import { test, expect } from "./test-fixtures.mjs";

const expected = JSON.parse(readFileSync(new URL("./catalog.expected.json", import.meta.url), "utf8"));

test("global category filtering supports selection, clearing, and keyboard controls", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  const site = await (await context.request.get("/data/site.json")).json();
  await page.goto("/");
  const category = site.essays.items[0].kicker;
  await page.locator(".essay-list").getByRole("button", { name: category, exact: true }).first().click();
  await expect(page.locator(".essay-list h2")).toHaveText(site.essays.items.filter((item) => item.kicker === category).map((item) => item.title));
  for (const section of [".project-section", ".music-section", ".arts-section"]) await expect(page.locator(section)).toBeHidden();
  const selected = page.locator(".essay-list").getByRole("button", { name: category, exact: true }).first();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toBeFocused();
  await selected.press("Enter");
  await expect(page.locator(".essay-list h2")).toHaveCount(4);
  for (const section of [".project-section", ".music-section", ".arts-section"]) await expect(page.locator(section)).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Filter content" });
  for (const [label, selector] of [[site.mprlab.label, ".project-section"], [site.music.label, ".music-section"], [site.arts.label, ".arts-section"], [site.essays.label, ".essay-section"]]) {
    const button = filters.getByRole("button", { name: label, exact: true });
    await button.focus(); await button.press("Space");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(selector)).toBeVisible();
    for (const other of [".project-section", ".essay-section", ".music-section", ".arts-section"].filter((value) => value !== selector)) await expect(page.locator(other)).toBeHidden();
  }
  await filters.getByRole("button", { name: "All", exact: true }).click();
  for (const section of [".project-section", ".essay-section", ".music-section", ".arts-section"]) await expect(page.locator(section)).toBeVisible();
  await filters.screenshot({ path: `output/playwright/filters-${test.info().project.name}.png` });
  const overflow = await page.evaluate(() => [...document.querySelectorAll("main *, .hero *")].filter((element) => element.getBoundingClientRect().right > window.innerWidth).map((element) => `${element.tagName}.${element.className}`).slice(0, 20));
  expect(overflow).toEqual([]);
});

test("global category filtering selects before the card limit and accepts source tags", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await context.route("**/data/site.json", async (route) => {
    const site = await (await route.fetch()).json();
    site.essays.items.push({ title: "Source-tagged fifth essay", source: "Research", url: "https://example.com/essay", summary: "Test catalog entry.", order: 50, status: "live" });
    await route.fulfill({ json: site });
  });
  await page.goto("/");
  const filters = page.getByRole("navigation", { name: "Filter content" });
  await filters.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.locator(".essay-list h2")).toHaveText(["Source-tagged fifth essay"]);
  await page.locator(".essay-list").getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.locator(".essay-list h2")).toHaveCount(4);
  await expect(filters.getByRole("button", { name: "All", exact: true })).toBeFocused();
});

test("one canonical catalog supplies the built pages and playback allowlist", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  const response = await context.request.get("/data/site.json");
  const site = await response.json();
  expect(site.music).toEqual(expected);
  expect((await context.request.get("/data/music.json")).status()).toBe(404);
  const allowlist = await (await context.request.get("/music/playback-allowlist.json")).json();
  expect(allowlist.tracks).toEqual(expected.items.flatMap((album) => album.tracks.map(({ id, playback }) => ({ id, playback }))));
  await page.goto("/music/");
  await expect(page.locator("mpr-header")).toHaveAttribute("brand-href", "/");
  await expect(page.locator("mpr-footer")).toHaveAttribute("menu", /"placement":"top"/);
  await page.goto("/");
  await expect(page.locator(".hero-copy h1")).toHaveText(site.hero.title);
  await expect(page.locator(".music-list .music-card")).toHaveCount(3);
  for (const section of [".project-section", ".essay-section", ".arts-section"]) await expect(page.locator(section)).toBeVisible();
  const footer = page.locator("mpr-footer");
  await footer.getByRole("button", { name: "Built by Marco Polo Research Lab", exact: true }).click();
  const contact = footer.getByRole("link", { name: site.contact.label, exact: true });
  await expect(contact).toBeVisible();
  await expect(contact).toHaveAttribute("href", site.contact.href);
});

test("invalid music content produces a visible error", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await context.route("**/data/site.json", async (route) => {
    const response = await route.fetch();
    const site = await response.json();
    const music = structuredClone(expected);
    music.items[0].tracks[1].id = music.items[0].tracks[0].id;
    await route.fulfill({ json: { ...site, music } });
  });
  await page.goto("/music/");
  await expect(page.getByRole("alert")).toContainText("Music is unavailable");
  await expect(page.locator(".album-card")).toHaveCount(0);
});

test("the built music pages preserve all five albums and 41 track titles", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.goto("/music/");
  await expect(page.locator(".album-card")).toHaveCount(5);
  for (const album of expected.items) {
    await expect(page.getByRole("heading", { name: album.displayTitle || album.title, exact: true })).toBeVisible();
  }
  let titles = 0;
  for (const album of expected.items) {
    await page.goto("/music/");
    await page.locator(`.album-card a[href="/music/${album.slug}/"]`).click();
    await expect(page).toHaveURL(new RegExp(`/music/${album.slug}/$`));
    await expect(page.getByRole("heading", { level: 1, name: album.displayTitle || album.title, exact: true })).toBeVisible();
    const tracks = page.locator(".track-list > li");
    await expect(tracks).toHaveCount(album.tracks.length);
    for (let index = 0; index < album.tracks.length; index++) {
      await expect(tracks.nth(index)).toContainText(album.tracks[index].title);
      titles++;
    }
    for (const [platform, href] of Object.entries(album.streamingLinks)) {
      await expect(page.locator(`.streaming-links a[href="${href}"]`), platform).toBeVisible();
    }
  }
  expect(titles).toBe(41);
});

test("the footer initializes when its library loads after the catalog", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.route(/\/mpr-ui@[^/]+\/mpr-ui\.js$/, async (route) => {
    await page.waitForSelector(".album-card");
    await route.fallback();
  });
  await page.goto("/music/");
  await expect(page.locator("mpr-footer")).toHaveAttribute("menu", /"placement":"top"/);
});

test("album cards retain direct streaming links", async ({ page, context }) => {
  await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
  await page.goto("/music/");
  for (const album of expected.items) {
    const card = page.locator(".album-card").filter({ has: page.getByRole("heading", { name: album.displayTitle || album.title, exact: true }) });
    for (const href of Object.values(album.streamingLinks)) await expect(card.locator(`a[href="${href}"]`)).toBeVisible();
  }
});
