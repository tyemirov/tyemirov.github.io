// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test('one homepage menu scrolls to sections before entering their collections', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Sections', exact: true });
  await expect(menu.getByRole('link')).toHaveText(['Articles', 'Music', 'Gallery', 'Software by MPR Lab ↗']);
  await expect(page.getByRole('navigation', { name: 'Filter content' })).toHaveCount(0);
  expect(await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.id))).toEqual(['articles', 'music', 'gallery']);
  for (const [label, id, collection] of [['Articles', 'articles', 'All articles'], ['Music', 'music', 'View all music'], ['Gallery', 'gallery', 'Enter Gallery']]) {
    await menu.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/#${id}$`));
    await expect(page.locator(`#${id} .section-title`)).toBeInViewport();
    await page.reload();
    await expect(page.locator(`#${id} .section-title`)).toBeInViewport();
    await page.locator(`#${id}`).getByRole('link', { name: new RegExp(collection) }).click();
    await expect(page).toHaveURL(new RegExp(`/${id}/$`));
    await page.goto('/');
  }
  await expect(menu.getByRole('link', { name: 'Software by MPR Lab ↗' })).toHaveAttribute('href', 'https://mprlab.com');
});

test('Articles contains every interactive tool and keeps topic filtering within the collection', async ({ page }) => {
  await page.goto('/');
  await page.locator('.essay-list').getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page).toHaveURL(/\/articles\/\?topic=AI$/);
  const filters = page.getByRole('navigation', { name: 'Filter articles' });
  await filters.getByRole('button', { name: 'All', exact: true }).click();
  const site = await (await page.request.get('/data/site.json')).json();
  for (const project of site.projects) {
    const card = page.locator('#article-list article').filter({ has: page.getByRole('link', { name: project.title, exact: true }) });
    await expect(card.getByRole('link', { name: 'Read companion article', exact: true })).toHaveAttribute('href', project.sourceUrl);
    await card.getByRole('link', { name: 'Explore interactive tool', exact: true }).click();
    await page.waitForLoadState('load');
    const parent = page.getByRole('navigation', { name: 'Page hierarchy' }).getByRole('link', { name: 'Articles', exact: true });
    await expect(parent).toHaveAttribute('href', '/articles/');
    await parent.click();
    await expect(page).toHaveURL(/\/articles\/$/);
  }
  expect((await (await page.request.get('/data/routes.json')).json()).some(route => route.path === '/models/')).toBe(false);
});
