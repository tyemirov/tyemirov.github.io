// @ts-check
import { test, expect } from '../music/test-fixtures.mjs';

test('personal sections and topic selection survive history, reload, and keyboard activation', async ({ page }) => {
  await page.goto('/');
  for (const [label, href] of [['Models','/models/'],['Articles','/articles/'],['Music','/music/'],['Gallery','/gallery/']]) {
    await expect(page.locator('.hero-links').getByRole('link', {name:label, exact:true})).toHaveAttribute('href',href);
  }
  await page.locator('.project-list').getByRole('button',{name:'Modeling',exact:true}).first().click();
  await expect(page).toHaveURL(/\?topic=Modeling$/);
  await expect(page.locator('.project-list .project-card')).toHaveCount(3);
  await expect(page.getByRole('heading',{name:'Modeling',exact:true})).toHaveCount(1);
  await expect(page.locator('.project-list button')).toHaveCount(0);
  const selected=page.locator('.site-filters').getByRole('button',{name:'Modeling',exact:true});
  await expect(selected).toBeFocused();
  await page.reload();
  await expect(page.locator('.project-list .project-card')).toHaveCount(3);
  await page.locator('.site-filters').getByRole('button',{name:'Decisioning',exact:true}).click();
  await expect(page.locator('.project-list .project-card')).toHaveCount(1);
  await page.goBack();
  await expect(selected).toBeFocused();
  await expect(page.locator('.project-list .project-card')).toHaveCount(3);
  await page.goForward();
  await expect(page.locator('.site-filters').getByRole('button',{name:'Decisioning',exact:true})).toBeFocused();
  await expect(page.locator('.project-list .project-card')).toHaveCount(1);
  await page.locator('.site-filters').getByRole('button',{name:'All',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.project-list .project-card')).toHaveCount(4);
  await expect(page.locator('.site-filters').getByRole('button',{name:'All',exact:true})).toBeFocused();
  await expect(page.locator('.site-filters')).not.toContainText(/Tools|Substack|MPR Lab/);
  await page.goto('/models/?topic=AI');
  await expect(page.getByText('No items match this topic.',{exact:true})).toBeVisible();
});

test('models have consistent titles and usable responsive layouts', async ({page}) => {
  const site=await (await page.request.get('/data/site.json')).json();
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for(const project of site.projects) {
      await page.goto(project.href);
      await expect(page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link')).toHaveText(['^','Models']);
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
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.goto('/?topic=Modeling');
    await expect(page.locator('.project-card')).toHaveCount(3);
    const cards=await page.locator('.project-list .project-card').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().right));
    const grid=await page.locator('.project-list').boundingBox();
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
  await page.locator('.site-filters').getByRole('button',{name:'AI',exact:true}).click();
  await expect(page.locator('.essay-list article')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.essay-list article')).toHaveCount(5);
});
