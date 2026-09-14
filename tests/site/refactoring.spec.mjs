// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test('article topics survive history, reload, and keyboard activation', async ({ page }) => {
  await page.goto('/articles/');
  await page.locator('#article-list').getByRole('button', { name: 'Modeling', exact: true }).first().click();
  await expect(page).toHaveURL(/\?topic=Modeling$/);
  const cards = page.locator('#article-list .project-card');
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Articles', exact: true })).toHaveCount(1);
  await expect(cards.locator('button')).toHaveCount(0);
  const navigation = page.locator('#article-filters');
  const selected = navigation.getByRole('button', { name: 'Modeling', exact: true });
  await expect(selected).toBeFocused();
  await page.reload();
  await expect(cards).toHaveCount(3);
  await navigation.getByRole('button', { name: 'Decisioning', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.goBack();
  await expect(selected).toBeFocused();
  await expect(cards).toHaveCount(3);
  await page.goForward();
  await expect(navigation.getByRole('button', { name: 'Decisioning', exact: true })).toBeFocused();
  await expect(cards).toHaveCount(1);
  await navigation.getByRole('button', { name: 'All', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/articles\/$/);
  const site = await (await page.request.get('/data/site.json')).json();
  await expect(cards).toHaveCount(site.articles.items.length + site.projects.length);
  await expect(navigation.getByRole('button', { name: 'All', exact: true })).toBeFocused();
});

test('models have consistent titles and usable responsive layouts', async ({page}) => {
  const site=await (await page.request.get('/data/site.json')).json();
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for(const project of site.projects) {
      await page.goto(project.href);
      await expect(page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link')).toHaveText(['^','Articles']);
      if (project.slug === 'freedom') {
        await page.locator('#goalSchoolChoice').check();
        await page.locator('#incomeValue').fill('120000');
        await page.locator('#recomputeButton').click();
        await page.locator('summary').filter({hasText:'Methodology & Sources'}).click();
      }
      if (project.slug === 'timeseries') {
        await page.locator('#example-button').click();
        await page.locator('#compute-button').click();
        await expect(page.locator('#result-state-value')).not.toHaveText('Pending...');
      }
      const overflow = await page.locator('body *').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().right > innerWidth).map(element => ({tag:element.tagName, id:element.id, class:element.className, right:element.getBoundingClientRect().right, width:element.getBoundingClientRect().width})));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth), JSON.stringify({path:project.href, overflow})).toBeLessThanOrEqual(width);
    }
    await page.goto('/articles/?topic=Modeling');
    await expect(page.locator('.project-card')).toHaveCount(3);
    const cards=await page.locator('#article-list .project-card').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().right));
    const grid=await page.locator('#article-list').boundingBox();
    expect(Math.max(...cards)).toBeGreaterThan(grid.x+grid.width-3);
  }
  await page.goto('/timeseries/');
  await expect(page.getByRole('heading',{name:'Time Series and Thresholds',exact:true})).toBeVisible();
});

test('short page footer keeps every shared destination inside the viewport', async ({page})=>{
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/404.html');
    const footer=page.locator('mpr-footer');
    await footer.getByRole('button',{name:/Website software by/}).click();
    for(const link of await footer.locator('a:visible').all()) {
      const box=await link.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      await link.click({trial:true});
    }
  }
});

test('topic results include every matching article beyond the overview limit', async ({page,context}) => {
  await context.route('**/data/site.json',async route=>{
    const site=await (await route.fetch()).json();
    site.articles.items.push({...site.articles.items[0],id:'extra-article',slug:'extra-article',title:'Fifth matching article',order:99});
    await route.fulfill({json:site});
  });
  await page.goto('/');
  await expect(page.locator('.essay-list article')).toHaveCount(4);
  await page.locator('.essay-list').getByRole('button',{name:'AI',exact:true}).first().click();
  await expect(page.locator('#article-list article')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('#article-list article')).toHaveCount(5);
});
