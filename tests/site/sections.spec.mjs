// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test('one homepage menu scrolls to sections before entering their collections', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Sections', exact: true });
  await expect(menu.getByRole('link')).toHaveText(['Articles', 'Music', 'Gallery', 'Tools']);
  await expect(page.getByRole('navigation', { name: 'Filter content' })).toHaveCount(0);
  expect(await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.id))).toEqual(['articles', 'music', 'gallery', 'tools']);
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
  await menu.getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page).toHaveURL(/\/#tools$/);
  await expect(page.locator('#tools .section-title')).toBeInViewport();
  await page.reload();
  await expect(page.locator('#tools .section-title')).toBeInViewport();
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

for (const width of [390, 1280]) {
  test(`Tools presents Platform and work-in-progress games at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#tools');
    const tools = page.getByRole('region', { name: 'Tools', exact: true });
    await expect(tools.getByRole('heading', { name: 'Tools', exact: true })).toBeInViewport();
    await expect(tools.getByRole('heading', { level: 3 })).toHaveText(['Platform', 'Games']);
    await expect(tools.getByRole('link', { name: 'Explore MPR Lab ↗', exact: true })).toHaveAttribute('href', 'https://mprlab.com/');
    await expect(tools.locator('.game-card h4')).toHaveText(['Hecate', 'Allergy Wheel', 'StackLab']);
    await expect(tools.locator('.game-status')).toHaveText(['Work in progress', 'Work in progress', 'Work in progress']);
    for (const [name, href] of [['Hecate', 'https://hecate.mprlab.com/'], ['Allergy Wheel', 'https://allergy.mprlab.com/']]) {
      await expect(tools.getByRole('link', { name: `Try ${name} ↗`, exact: true })).toHaveAttribute('href', href);
    }
    const stackLab = tools.locator('.game-card').filter({ has: page.getByRole('heading', { name: 'StackLab', exact: true }) });
    await expect(stackLab.locator('p.game-summary')).not.toBeEmpty();
    await expect(stackLab.getByRole('link')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
