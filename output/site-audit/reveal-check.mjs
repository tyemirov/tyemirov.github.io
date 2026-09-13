// @ts-check
import {chromium} from 'playwright';import {writeFile} from 'node:fs/promises';
const b=await chromium.launch();const results=[];const footer=[];
for(const width of [1440,390]){
 const context=await b.newContext({viewport:{width,height:950}});const p=await context.newPage();let capture=false;const nav=[];
 await context.route('**/*',r=>{if(capture&&r.request().isNavigationRequest()){nav.push(r.request().url());return r.fulfill({status:204})}return r.continue()});
 context.on('page',x=>{if(x!==p)setTimeout(()=>x.close().catch(()=>{}),300)});
 await p.goto('http://localhost:8080/freedom/');await p.locator('summary').filter({hasText:'Methodology & Sources'}).click();capture=true;
 for(const a of await p.locator('details a').all()){
  const url=await a.getAttribute('href');const label=await a.innerText();const start=nav.length;await a.click({noWaitAfter:true});await p.waitForTimeout(100);results.push({page:'/freedom/',width,href:url,label,result:'navigation-clicked',requests:nav.slice(start)});
 }
 capture=false;await p.goto('http://localhost:8080/404.html');await p.locator('mpr-footer button[aria-expanded="false"]').click();
 const first=p.getByRole('link',{name:'Marco Polo Research Lab',exact:true});
 footer.push({width,bounds:await first.boundingBox(),viewportHeight:950});
 await p.screenshot({path:`output/site-audit/404-menu-${width}.png`,fullPage:true});
 await context.close();
}
await b.close();await writeFile('output/site-audit/revealed-links.json',JSON.stringify({results,footer},null,2));console.log(JSON.stringify({results,footer}));
