// @ts-check
import {readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const r=JSON.parse(await readFile('output/site-audit/links.partial.json'));const candidates=r.links.filter(x=>x.result==='click-failed'&&x.text.startsWith('Skip'));
const b=await chromium.launch();const results=[];let cursor=0;
await Promise.all(Array.from({length:3},async()=>{const p=await b.newPage();while(cursor<candidates.length){const c=candidates[cursor++];await p.setViewportSize({width:c.width,height:950});await p.goto('http://localhost:8080'+c.page);const a=p.getByRole('link',{name:c.text,exact:true});await a.focus();await a.press('Enter');results.push({...c,result:'keyboard-activated',fragmentExists:await p.evaluate(()=>!!document.getElementById(location.hash.slice(1))),landedUrl:p.url()});}await p.close();}));
await b.close();await writeFile('output/site-audit/keyboard.json',JSON.stringify(results,null,2));console.log(JSON.stringify({checked:results.length,missing:results.filter(x=>!x.fragmentExists)}));
