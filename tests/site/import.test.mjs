// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { publishCatalog } from '../../assets/js/catalog.js';

test('publication import preserves full articles and rejects a stale base before writes', async () => {
  const directory=await mkdtemp(join(tmpdir(),'gallery-import-'));
  try {
    await mkdir(join(directory,'data'));
    const source=JSON.parse(await readFile('data/site.json','utf8'));
    const original=JSON.stringify(source,null,2)+'\n';
    await writeFile(join(directory,'data/site.json'),original);
    const current=JSON.stringify(publishCatalog(source),null,2)+'\n';
    const candidate=publishCatalog(source);
    candidate.gallery.description='A reviewed gallery publication.';
    const digest=value=>createHash('sha256').update(value).digest('hex');
    const catalog=JSON.stringify(candidate,null,2)+'\n';
    const files={'data/site.json':catalog,'publication.json':JSON.stringify({baseCatalogSha256:digest(current),catalogSha256:digest(catalog),draftEtag:'"draft-1"'})};
    for (const artwork of candidate.gallery.artworks) for (const path of [artwork.image.cardUrl,artwork.image.lightboxUrl]) files[path.slice(1)]=(await readFile('.'+path)).toString('base64');
    const archive=join(directory,'publication.zip');
    const zipped=spawnSync('python3',['-c','import json,sys,zipfile,base64\nf=json.load(sys.stdin)\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n for n,v in f.items(): z.writestr(n,v if n.endswith(".json") else base64.b64decode(v))',archive],{input:JSON.stringify(files),encoding:'utf8'});
    assert.equal(zipped.status,0,zipped.stderr);
    const run=()=>spawnSync(process.execPath,['scripts/site/import-gallery.mjs',archive,directory],{encoding:'utf8'});
    const result=run(); assert.equal(result.status,0,result.stderr);
    const imported=JSON.parse(await readFile(join(directory,'data/site.json'),'utf8'));
    assert.deepEqual(imported.articles,source.articles);
    assert.deepEqual(imported.projects,source.projects);
    assert.equal(imported.gallery.description,candidate.gallery.description);
    const saved=await readFile(join(directory,'data/site.json'),'utf8');
    const stale=run(); assert.notEqual(stale.status,0); assert.match(stale.stderr,/catalog changed/);
    assert.equal(await readFile(join(directory,'data/site.json'),'utf8'),saved);
  } finally {await rm(directory,{recursive:true,force:true});}
});
