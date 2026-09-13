// @ts-check
import { test, expect } from "../music/test-fixtures.mjs";

const artworks = [1, 2].map(number => ({
  id: `study-${number}`, title: `Study ${number}`, description: `Description of study ${number}.`,
  alt: `Study ${number}`, medium: "Digital artwork", year: "2025",
  image: { cardUrl: `/gallery/images/previews/third-act-0${number}-preview.jpg`, lightboxUrl: `/gallery/images/full/third-act-0${number}.png`, width: 1536, height: 1024, format: "PNG" },
  offer: null,
}));
const gallery = {
  brand: "Vadym Tyemirov · Virtual Gallery", description: "Selected digital works.", label: "Arts", title: "Gallery",
  artworks,
  collections: [{ id: "studies", title: "Permanent Studies", introduction: "An ordered collection.", coverArtworkId: "study-1", coverPosition: [50, 50], artworkIds: ["study-1", "study-2"] }],
  exhibits: [
    { id: "first", title: "First Exhibit", subtitle: "", introduction: "First presentation.", startDate: "2025-01-01", endDate: "2025-02-01", coverArtworkId: "study-1", coverPosition: [50, 50], sections: [{ id: "opening", title: "Opening", artworkIds: ["study-1", "study-2"] }] },
    { id: "second", title: "Second Exhibit", subtitle: "", introduction: "Second presentation.", startDate: "2025-03-01", endDate: "2025-04-01", coverArtworkId: "study-2", coverPosition: [50, 50], sections: [{ id: "response", title: "Response", artworkIds: ["study-2", "study-1"] }] },
  ],
};

test.beforeEach(async ({ context }) => {
  await context.route(/loopaware\.mprlab\.com|www\.paypal\.com/, route => route.abort());
});

test("one artwork catalog supports independent exhibits and a permanent collection", async ({ page, context }) => {
  const published = structuredClone(gallery);
  const requests = [];
  page.on("request", request => { if (request.url().includes("/gallery/data/")) requests.push(request.url()); });
  await context.route("**/data/site.json", async route => {
    const site = await (await route.fetch()).json();
    await route.fulfill({ json: { ...site, gallery: published } });
  });
  await page.goto("/gallery/");
  await page.getByRole("link", { name: "Permanent Studies", exact: true }).click();
  await expect(page).toHaveURL(/\/gallery\/collections\/studies\/$/);
  await expect(page.locator(".artwork-card__title")).toHaveText(["Study 1", "Study 2"]);
  await expect(page.getByRole("button", { name: "Add to Basket", exact: true })).toHaveCount(0);
  await page.locator("[data-media]").first().click();
  const lightbox = page.getByRole("dialog");
  await expect(lightbox.locator("img")).toHaveAttribute("alt", "Study 1");
  await page.keyboard.press("ArrowRight");
  await expect(lightbox.locator("img")).toHaveAttribute("alt", "Study 2");
  await page.keyboard.press("ArrowLeft");
  await expect(lightbox.locator("img")).toHaveAttribute("alt", "Study 1");
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
  await expect(page.locator("[data-media]").first()).toBeFocused();
  for (const [id, title, section, order] of [["first", "First Exhibit", "Opening", ["Study 1", "Study 2"]], ["second", "Second Exhibit", "Response", ["Study 2", "Study 1"]]]) {
    await page.goto(`/gallery/exhibits/${id}/`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    await expect(page.locator(".artwork-card__title")).toHaveText(order);
  }
  published.exhibits[0].sections[0].artworkIds.reverse();
  published.artworks[0].title = "Shared Study";
  await page.goto("/gallery/exhibits/first/");
  await page.reload();
  await expect(page.locator(".artwork-card__title")).toHaveText(["Study 2", "Shared Study"]);
  await page.goto("/gallery/collections/studies/");
  await page.reload();
  await expect(page.locator(".artwork-card__title")).toHaveText(["Shared Study", "Study 2"]);
  await page.goto("/gallery/artworks/study-1/");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shared Study", exact: true })).toBeVisible();
  await expect(page.getByText("1536 × 1024 px", { exact: false })).toBeVisible();
  expect(requests).toEqual([]);
});

test("the published gallery stores the four migrated artworks only once", async ({ page, context }) => {
  const site = await (await context.request.get("/data/site.json")).json();
  expect(site.gallery.artworks).toHaveLength(4);
  expect(new Set(site.gallery.artworks.map(artwork => artwork.id)).size).toBe(4);
  expect(site.gallery.collections).toHaveLength(1);
  expect(site.gallery.exhibits[0].sections[0].artworkIds).toEqual(site.gallery.collections[0].artworkIds);
  expect(site.gallery.exhibits[0]).not.toHaveProperty("artworks");
  for (const artwork of site.gallery.artworks) {
    expect(artwork.offer).toBeNull();
    expect(artwork.image.width).toBe(1536);
    expect(artwork.image.height).toBe(1024);
  }
  expect((await context.request.get("/gallery/data/exhibits.json")).status()).toBe(404);
  expect((await context.request.get("/gallery/data/site.json")).status()).toBe(404);
  await page.goto("/gallery/");
  await expect(page.getByRole("link", { name: "The Third Act", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Selected Works", exact: true })).toBeVisible();
});

async function publishFixture(context, catalog) {
  await context.route('**/data/site.json', async route => {
    const site = await (await route.fetch()).json();
    await route.fulfill({ json: { ...site, gallery: catalog } });
  });
}

for (const [name, corrupt] of [
  ['an embedded exhibit shape', catalog => { catalog.exhibits[0].artworks = catalog.artworks; }],
  ['an unknown artwork reference', catalog => { catalog.collections[0].artworkIds.push('absent'); }],
  ['a private master reference', catalog => { catalog.artworks[0].master = '/private/original.png'; }],
  ['an image URL with an array type', catalog => { catalog.artworks[0].image.cardUrl = [catalog.artworks[0].image.cardUrl]; }],
  ['a private image URL', catalog => { catalog.artworks[0].image.lightboxUrl = '/private/original.png'; }],
  ['an impossible date', catalog => { catalog.exhibits[0].startDate = '2025-02-30'; }],
]) {
  test(`the gallery rejects ${name} at the catalog boundary`, async ({ page, context }) => {
    const invalid = structuredClone(gallery); corrupt(invalid); await publishFixture(context, invalid);
    await page.goto('/gallery/');
    await expect(page.getByRole('alert')).toContainText('The gallery could not load');
    await expect(page.locator('.exhibit-card')).toHaveCount(0);
  });
}

test('exhibit dates change the visible groups while collections remain available', async ({ page, context }) => {
  await publishFixture(context, gallery);
  await page.clock.install({ time: new Date('2025-01-15T12:00:00Z') });
  await page.goto('/gallery/');
  await expect(page.getByRole('heading', { name: 'Now Showing', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Past Exhibits', exact: true })).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Past Exhibits', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Now Showing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Upcoming', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Permanent Studies', exact: true }).click();
  await expect(page.locator('.artwork-card__title')).toHaveText(['Study 1', 'Study 2']);
});

test('gallery text renders literally and metadata contains no invented offers', async ({ page, context }) => {
  const catalog = structuredClone(gallery);
  catalog.artworks[0].title = '<img src=x onerror="window.catalogScriptExecuted=true">';
  await publishFixture(context, catalog);
  await page.goto('/gallery/exhibits/first/');
  await expect(page.locator('.artwork-card__title').first()).toHaveText(catalog.artworks[0].title);
  expect(await page.evaluate(() => window.catalogScriptExecuted)).toBeUndefined();
  const metadata = JSON.parse(await page.locator('#structured-data').textContent());
  expect(metadata.workFeatured[0].name).toBe(catalog.artworks[0].title);
  expect(metadata.workFeatured[0]).not.toHaveProperty('offers');
  expect(metadata.workFeatured[0].image).toBe('https://tyemirov.net/gallery/images/full/third-act-01.png');
});

for (const width of [390, 1280]) {
  test(`gallery detail and lightbox controls fit ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await publishFixture(context, gallery);
    await page.goto('/gallery/collections/studies/');
    await page.locator('[data-media]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Previous artwork', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Next artwork', exact: true }).click();
    await expect(dialog.locator('img')).toHaveAttribute('alt', 'Study 2');
    await expect(dialog.getByRole('button', { name: 'Next artwork', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Previous artwork', exact: true }).click();
    await expect(dialog.locator('img')).toHaveAttribute('alt', 'Study 1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await dialog.boundingBox();
    expect(bounds.height).toBeLessThanOrEqual(844);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `output/playwright/gallery-lightbox-${width}-${test.info().project.name}.png` });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `output/playwright/gallery-collection-${width}-${test.info().project.name}.png`, fullPage: true });
  });
}
