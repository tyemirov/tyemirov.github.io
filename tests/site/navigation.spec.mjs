// @ts-check
import {test,expect} from '../music/test-fixtures.mjs';

test('internal pages show only home and their parent in the header',async({page,context})=>{
 await context.route(/loopaware\.mprlab\.com/,route=>route.abort());
 const site=await (await page.request.get('/data/site.json')).json();
 for(const [path,parents] of [['/music/',[]],[`/music/${site.music.items[0].slug}/`,['Music']],['/gallery/',[]],[`/gallery/artworks/${site.gallery.artworks[0].id}/`,['Gallery']],['/gallery/about/',['Gallery']],['/gallery/studio/',['Gallery']],['/articles/',[]],[`/articles/${site.articles.items[0].slug}/`,['Articles']],['/civilization/',[]],['/404.html',[]]]){
  await page.goto(path);
  const nav=page.getByRole('navigation',{name:'Page hierarchy',exact:true});
  await expect(nav.getByRole('link')).toHaveText(['^',...parents]);
  await expect(nav.getByRole('link',{name:'Home',exact:true})).toHaveAttribute('href','/');
  expect(await nav.locator(`a[href="${path}"]`).count()).toBe(0);
 }
 await page.goto('/gallery/');
 await page.getByRole('link',{name:'About',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link')).toHaveText(['^','Gallery']);
 await page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link',{name:'Gallery',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link')).toHaveText(['^']);
 await page.goto(`/music/${site.music.items[0].slug}/`);
 await page.getByRole('navigation',{name:'Page hierarchy'}).getByRole('link',{name:'Music',exact:true}).click();
 await expect(page).toHaveURL(/\/music\/$/);
 await page.getByRole('link',{name:'Home',exact:true}).click();await expect(page).toHaveURL('https://localhost:18443/');
});

test('selected sections omit the repeated section label and All restores it',async({page})=>{
 await page.goto('/');
 const filters=page.getByRole('navigation',{name:'Filter content'});
 const site=await (await page.request.get('/data/site.json')).json();
 for(const [label,selector] of [[site.mprlab.label,'.project-section'],[site.articles.label,'.essay-section'],[site.music.label,'.music-section'],[site.gallery.label,'.arts-section']]){
  await filters.getByRole('button',{name:label,exact:true}).click();
  await expect(page.locator(`${selector} .notes-label`)).toBeHidden();
  await expect(page.locator(`${selector} .section-title`)).toBeVisible();
 }
 await filters.getByRole('button',{name:'All',exact:true}).click();
 for(const label of await page.locator('.notes-label').all())await expect(label).toBeVisible();
});

test('album covers open albums and streaming services use labeled icons',async({page})=>{
 await page.goto('/music/');
 await expect(page.getByRole('link',{name:'Album Notes',exact:true})).toHaveCount(0);
 const first=page.locator('.album-card').first();
 const cover=first.locator('a.album-cover');await expect(cover).toBeVisible();
 for(const link of await page.locator('.streaming-link').all()){
  await expect(link.locator('svg')).toBeVisible();
  expect(await link.getAttribute('aria-label')).toBeTruthy();
  expect((await link.innerText()).trim()).toBe('');
 }
 await page.screenshot({path:`output/playwright/polish/music-index-${test.info().project.name}.png`,fullPage:true});
 await cover.click();await expect(page.locator('.album-title-large')).toBeVisible();
 for(const link of await page.locator('.streaming-link').all())await expect(link.locator('svg')).toBeVisible();
 for(const width of [390,769,1280]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`output/playwright/polish/album-${width}-${test.info().project.name}.png`,fullPage:true});
 }
});
