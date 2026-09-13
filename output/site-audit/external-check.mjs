// @ts-check
import {readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const data=JSON.parse(await readFile('output/site-audit/audit.json'));const urls=data.destinations.filter(x=>x.error||x.status>=400).map(x=>x.url);const b=await chromium.launch();let cursor=0;const results=[];
await Promise.all(Array.from({length:3},async()=>{while(cursor<urls.length){const url=urls[cursor++];const p=await b.newPage();try{const response=await p.goto(url,{waitUntil:'domcontentloaded',timeout:18000});results.push({url,status:response.status(),title:await p.title(),text:(await p.locator('body').innerText({timeout:2000})).slice(0,180)});}catch(e){results.push({url,error:e.message.split('\n')[0]})}await p.close();}}));
await b.close();await writeFile('output/site-audit/external-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
