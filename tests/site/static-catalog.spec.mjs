// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const text = 'How to write </script><p id="injected">HTML</p> <!-- <script> & "quotes"';
let output;
let source;
let albums;

test.use({ javaScriptEnabled: false });
test.beforeAll(() => {
  output = mkdtempSync(join(tmpdir(), 'site-static-catalog-'));
  source = JSON.parse(readFileSync('data/site.json', 'utf8'));
  source.music.items[0].status = 'draft';
  const album = structuredClone(source.music.items[1]);
  album.slug = 'new-album';
  album.title = text;
  album.displayTitle = 'A new album & "title"';
  album.subtitle = 'New subtitle <with> text';
  album.shortDescription = text;
  album.order = 0;
  album.tracks.forEach((track, index) => { track.id = `new-album-${index + 1}`; });
  source.music.items.push(album);
  source.articles.items[0].summary = text;
  albums = source.music.items.filter(album => album.status === 'live').sort((a, b) => a.order - b.order);
  const input = join(output, 'source.json');
  writeFileSync(input, JSON.stringify(source));
  execFileSync(process.execPath, ['scripts/site/build.mjs', output, input]);
});
test.afterAll(() => rmSync(output, { recursive: true, force: true }));
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ contentType: 'text/html', body: readFileSync(join(output, path, 'index.html'), 'utf8') });
    }
    return route.abort();
  });
});

test('static music cards follow catalog publication, order, and text without JavaScript', async ({ page }) => {
  await page.goto('/music/');
  const cards = page.locator('#album-grid .album-card');
  await expect(cards.locator('.album-title')).toHaveText(albums.map(album => album.displayTitle ?? album.title));
  await expect(page.locator(`a[href="/music/${source.music.items[0].slug}/"]`)).toHaveCount(0);
  for (const [index, album] of albums.entries()) {
    const card = cards.nth(index);
    await expect(card.locator('.album-cover')).toHaveAttribute('href', `/music/${album.slug}/`);
    await expect(card.locator('img')).toHaveAttribute('src', album.coverImage);
    await expect(card.locator('.album-description')).toHaveText(album.subtitle);
    await expect(card.locator('.album-meta')).toHaveText(`${album.latest ? 'Latest Release • ' : ''}${album.releaseDate.value} • ${album.tracks.length} Tracks`);
    await expect(card.locator('.album-translation')).toHaveText(album.translation ? [album.translation] : []);
    expect(await card.locator('.streaming-link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(Object.values(album.streamingLinks));
  }
  await cards.first().locator('.album-cover').click();
  await expect(page).toHaveURL(/\/music\/new-album\/$/);
  await expect(page).toHaveTitle(`${text} | Vadym Tyemirov`);
});

for (const kind of ['article', 'album']) {
  test(`${kind} JSON-LD preserves HTML delimiters as text`, async ({ page }) => {
    const path = kind === 'article' ? `/articles/${source.articles.items[0].slug}/` : '/music/new-album/';
    await page.goto(path);
    const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(schema['@graph'][0].description).toBe(text);
    await expect(page.locator('#injected')).toHaveCount(0);
  });
}
