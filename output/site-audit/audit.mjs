// @ts-check
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const origin='http://localhost:8080';
const out='output/site-audit';
await mkdir(out,{recursive:true});
const routes=JSON.parse(await readFile('.local/runtime/tyemirov-site-local/site/data/routes.json','utf8'));
const browser=await chromium.launch();
const pages=[],links=[],filters=[],destinations=[];
async function inspect(route,width){
 const context=await browser.newContext({viewport:{width,height:950},acceptDownloads:true});
 const page=await context.newPage();const errors=[];const navigation=[];let capture=false;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{
  const request=r.request();
  if(capture && request.isNavigationRequest()){
   navigation.push(request.url());await r.fulfill({status:204});return;
  }
  await r.continue();
 });
 context.on('page',p=>{if(p!==page)setTimeout(()=>p.close().catch(()=>{}),500)});
 const response=await page.goto(origin+route.path,{waitUntil:'networkidle',timeout:25000}).catch(e=>{errors.push(e.message);return null;});
 if(!response){pages.push({path:route.path,width,errors});await context.close();return;}
 const footer=page.locator('mpr-footer button[aria-expanded="false"]');
 if(await footer.count())await footer.first().click({timeout:3000}).catch(e=>errors.push('footer: '+e.message.split('\n')[0]));
 const list=await page.locator('a').evaluateAll(xs=>xs.map((a,index)=>{
  a.dataset.siteAuditLink=String(index);
  return {index,href:a.getAttribute('href'),resolved:a.href,text:(a.getAttribute('aria-label')||a.textContent||a.querySelector('img')?.alt||'').trim().replace(/\s+/g,' '),target:a.target,download:a.hasAttribute('download'),footer:!!a.closest('mpr-footer')};
 }));
 const headings=await page.locator('h1,h2').allTextContents();
 pages.push({path:route.path,width,status:response.status(),title:await page.title(),headings,overflow:await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})),errors,linkCount:list.length});
 capture=true;
 for(const link of list){
  const record={page:route.path,width,...link};const a=page.locator(`[data-site-audit-link="${link.index}"]`);
  if(!link.href){record.result='missing-href';links.push(record);continue;}
  if(/^(mailto:|tel:)/.test(link.href)){record.result='native-handoff-not-launched';links.push(record);continue;}
  if(!/^(https?:|#|\/|\.|[^:]+$)/.test(link.href)){record.result='unsupported-protocol';links.push(record);continue;}
  if(link.footer && !await a.isVisible()){
   const toggle=page.locator('mpr-footer button[aria-expanded="false"]');if(await toggle.count())await toggle.first().click({timeout:1500}).catch(()=>{});
  }
  if(!await a.isVisible()){record.result='hidden-in-this-viewport';links.push(record);continue;}
  const start=navigation.length;
  try {
   await a.click({timeout:2500,noWaitAfter:true});await page.waitForTimeout(80);
   record.requests=navigation.slice(start);
   const url=new URL(link.resolved);
   if(url.origin===origin && url.pathname===route.path && url.hash){
    record.fragmentExists=await page.evaluate(hash=>!!document.getElementById(decodeURIComponent(hash.slice(1)))||!!document.querySelector(`a[name="${CSS.escape(decodeURIComponent(hash.slice(1)))}"]`),url.hash);
    record.result=record.fragmentExists?'fragment-clicked':'missing-fragment';
   }else record.result=record.requests.length?'navigation-clicked':link.download?'download-clicked':'click-without-navigation';
  }catch(e){record.result='click-failed';record.error=e.message.split('\n')[0];}
  links.push(record);
 }
 await context.close();
 console.log(JSON.stringify({page:route.path,width,links:list.length,done:pages.length}));
 await writeFile(out+'/links.partial.json',JSON.stringify({pages,links},null,2));
}
const jobs=routes.concat([{path:'/404.html'}]).flatMap(route=>[1440,390].map(width=>({route,width})));
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];await inspect(job.route,job.width);}}));
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:950}});await page.goto(origin);await page.waitForSelector('.site-filters button');
 const names=await page.locator('.site-filters button').allTextContents();
 for(const name of names){
  await page.goto(origin);await page.getByRole('navigation',{name:'Filter content'}).getByRole('button',{name,exact:true}).click();
  const state=await page.evaluate(()=>({url:location.href,active:document.activeElement?.textContent,sections:[...document.querySelectorAll('main>section')].filter(x=>getComputedStyle(x).display!=='none').map(x=>({label:x.getAttribute('aria-label'),heading:x.querySelector('.section-title')?.textContent,kicker:x.querySelector('.notes-label')?.hidden?null:x.querySelector('.notes-label')?.textContent,cards:[...x.querySelectorAll('article,.music-card,.arts-preview')].map(c=>c.querySelector('h2,h3')?.textContent||c.getAttribute('aria-label'))})),overflow:document.documentElement.scrollWidth>innerWidth}));
  filters.push({width,filter:name,...state});
  await page.screenshot({path:`${out}/filter-${name.toLowerCase().replaceAll(' ','-')}-${width}.png`,fullPage:true});
 }
 await page.close();
}
await browser.close();
const unique=[...new Set(links.map(x=>x.resolved).filter(x=>/^https?:/.test(x)))];cursor=0;
await Promise.all(Array.from({length:5},async()=>{while(cursor<unique.length){const url=unique[cursor++];try{
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(18000)});destinations.push({url,status:response.status,finalUrl:response.url,contentType:response.headers.get('content-type')});await response.body?.cancel();
 }catch(e){destinations.push({url,error:e.cause?.code||e.name});}}}));
const result={checkedAt:new Date().toISOString(),origin,pages,links,filters,destinations,method:'Real anchor activation; document navigation intercepted with HTTP 204. Separate GET requests qualify each unique destination. Native mail and phone handoffs are inspected without launching applications.'};
await writeFile(out+'/audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({complete:true,pages:pages.length,links:links.length,filters:filters.length,destinations:destinations.length,results:links.reduce((s,x)=>(s[x.result]=(s[x.result]||0)+1,s),{}),destinationFailures:destinations.filter(x=>x.error||x.status>=400)}));
