// @ts-check
import {readFile,writeFile} from 'node:fs/promises';
const dir='output/site-refactor-audit/';
const audit=JSON.parse(await readFile(dir+'audit.json'));
const keyboard=JSON.parse(await readFile(dir+'keyboard.json'));
const revealed=JSON.parse(await readFile(dir+'revealed-links.json'));
for(const link of audit.links){
 const key=keyboard.find(x=>x.page===link.page&&x.width===link.width&&x.index===link.index);
 const disclosure=revealed.results.find(x=>x.page===link.page&&x.width===link.width&&new URL(x.href,audit.origin+x.page).href===link.resolved);
 if(key||disclosure){
  link.initialResult=link.result;
  link.result=key?'keyboard-activated':'disclosed-navigation-clicked';
  if(key){link.fragmentExists=key.fragmentExists;link.landedUrl=key.landedUrl;}
  else link.requests=disclosure.requests;
  delete link.error;
 }
}
audit.externalBrowser=JSON.parse(await readFile(dir+'external-browser.json'));
audit.footerBounds=revealed.footer;
audit.liveStudio=JSON.parse(await readFile(dir+'live-login.json'));
audit.servedArtifact=JSON.parse(await readFile(dir+'served-source.json'));
audit.summary={pages:audit.pages.length,uniquePages:new Set(audit.pages.map(x=>x.path)).size,widths:[390,768,1440],linkOccurrences:audit.links.length,results:audit.links.reduce((s,x)=>(s[x.result]=(s[x.result]||0)+1,s),{}),localDestinations:audit.destinations.filter(x=>x.url.startsWith(audit.origin)).length,externalDestinations:audit.destinations.filter(x=>!x.url.startsWith(audit.origin)).length,horizontalOverflow:audit.pages.filter(x=>x.overflow.scroll>x.overflow.width).length,pageExceptions:audit.pages.filter(x=>x.errors.length).length};
await writeFile('docs/site-link-audit-after-refactor-2026-09-11.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit.summary));
