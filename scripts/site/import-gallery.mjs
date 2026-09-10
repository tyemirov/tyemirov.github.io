// @ts-check
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateSourceCatalog, validatePublicCatalog, publishCatalog } from '../../assets/js/catalog.js';

const [archive,selectedRoot]=process.argv.slice(2);
if (!archive || !selectedRoot || process.argv.length!==4) throw new Error('Supply a publication ZIP and the selected repository root.');
const root=resolve(selectedRoot), catalogPath=join(root,'data/site.json');
const original=await readFile(catalogPath,'utf8');
const source=validateSourceCatalog(JSON.parse(original));
const published=publishCatalog(source);
const digest=value=>createHash('sha256').update(value).digest('hex');
// Read archive members into memory. Never extract untrusted archive paths.
const members=JSON.parse(execFileSync('python3',['-c',`import sys,json,zipfile,base64
with zipfile.ZipFile(sys.argv[1]) as z:
 entries=z.infolist()
 if len(entries)>25000 or sum(e.file_size for e in entries)>268435456: raise ValueError('Publication archive exceeds its bound')
 if len({e.filename for e in entries})!=len(entries): raise ValueError('Duplicate archive member')
 print(json.dumps({e.filename:base64.b64encode(z.read(e)).decode('ascii') for e in entries}))`,resolve(archive)],{encoding:'utf8',maxBuffer:360000000}));
const bytes=Object.fromEntries(Object.entries(members).map(([name,value])=>[name,Buffer.from(value,'base64')]));
if(!bytes['publication.json'] || !bytes['data/site.json']) throw new Error('Publication archive lacks its catalog or identity.');
const identity=JSON.parse(bytes['publication.json'].toString('utf8'));
if(Object.keys(identity).sort().join(',')!=='baseCatalogSha256,catalogSha256,draftEtag' || !/^[a-f0-9]{64}$/.test(identity.baseCatalogSha256) || !/^[a-f0-9]{64}$/.test(identity.catalogSha256) || !/^"draft-[1-9][0-9]*"$/.test(identity.draftEtag)) throw new Error('Invalid publication identity.');
if(identity.baseCatalogSha256!==digest(JSON.stringify(published,null,2)+'\n')) throw new Error('The selected catalog changed. Export a publication against the current catalog.');
if(identity.catalogSha256!==digest(bytes['data/site.json'])) throw new Error('Publication catalog checksum differs.');
const candidate=validatePublicCatalog(JSON.parse(bytes['data/site.json'].toString('utf8')));
const {gallery:previousGallery,...previousOther}=published;
const {gallery,...candidateOther}=candidate;
if(!isDeepStrictEqual(candidateOther,previousOther)) throw new Error('A gallery publication cannot change other site content.');
const allowed=new Set(['data/site.json','publication.json']);
for(const artwork of gallery.artworks) for(const path of [artwork.image.cardUrl,artwork.image.lightboxUrl]) allowed.add(path.slice(1));
if(Object.keys(bytes).length!==allowed.size || [...allowed].some(path=>!bytes[path])) throw new Error('Publication files differ from the referenced public images.');
const next=validateSourceCatalog({...source,gallery});
const additions=[];
for(const path of allowed) {
 if(!path.startsWith('gallery/images/')) continue;
 const target=join(root,path);
 try { if(!(await readFile(target)).equals(bytes[path])) throw new Error(`Publication changes immutable image ${path}.`); }
 catch(error) { if(error.code!=='ENOENT') throw error; additions.push([target,bytes[path]]); }
}
const temporary=catalogPath+'.'+randomUUID()+'.tmp';
try {
 for(const [target,value] of additions) {await mkdir(dirname(target),{recursive:true}); await writeFile(target,value,{flag:'wx'});}
 await writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
 if(await readFile(catalogPath,'utf8')!==original) throw new Error('The selected catalog changed during import.');
 await rename(temporary,catalogPath);
} finally {await rm(temporary,{force:true});}
process.stdout.write(JSON.stringify({draftEtag:identity.draftEtag,catalogDigest:digest(JSON.stringify(publishCatalog(next),null,2)+'\n')})+'\n');
