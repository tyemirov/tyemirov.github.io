// @ts-check
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const names=['mpr-ui-config.js','mpr-ui.js','mpr-ui.css'];
const directory=path.join(import.meta.dirname,'../../output/playwright/shared-ui-published');
let preparation;
async function prepareSharedUI(){
  const assets=await Promise.all(names.map(async name=>{
    const response=await fetch(`https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/${name}`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`shared_ui_download:${name}:${response.status}`);
    return {name,body:Buffer.from(await response.arrayBuffer()),version:response.headers.get('x-jsd-version')};
  }));
  if(new Set(assets.map(asset=>asset.version)).size!==1)throw new Error('shared_ui_mixed_published_versions');
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'metadata.json'),JSON.stringify({retrievedAt:new Date().toISOString(),assets:assets.map(({name,body,version})=>({name,version,sha256:createHash('sha256').update(body).digest('hex')}))},null,2));
  return assets;
}
/** @param {import('@playwright/test').BrowserContext} context */
export async function installSharedUIAssets(context){
  preparation ??= prepareSharedUI();
  for(const {name,body} of await preparation)await context.route(`https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/${name}*`,route=>route.fulfill({body,contentType:name.endsWith('.css')?'text/css':'application/javascript'}));
}
