// @ts-check
import { DatabaseSync } from 'node:sqlite';
import { readFile, access } from 'node:fs/promises';
import { galleryDraft } from '../../assets/js/generated/validators.js';
import { validateSourceCatalog, validateGalleryReferences } from '../../assets/js/catalog.js';

const [path,sourcePath]=process.argv.slice(2);
if(!path || !sourcePath || process.argv.length!==4) throw new Error('Supply the stopped gallery database and current source catalog.');
const source=validateSourceCatalog(JSON.parse(await readFile(sourcePath,'utf8')));
// Require an existing database. This operation never initializes storage.
await access(path);
const database=new DatabaseSync(path);
try {
 database.exec('BEGIN IMMEDIATE');
 const row=database.prepare('SELECT revision,body FROM draft WHERE id=1').get();
 if(!row) throw new Error('The database has no obsolete draft.');
 const value=JSON.parse(Buffer.from(row.body).toString('utf8'));
 if(value.gallery.siteUrl!==new URL('/gallery/',source.site.canonical).href || 'label' in value.gallery || 'title' in value.gallery) throw new Error('The database does not contain the selected obsolete draft.');
 delete value.gallery.siteUrl;
 value.gallery.label=source.gallery.label;
 value.gallery.title=source.gallery.title;
 if(!galleryDraft(value)) throw new Error('The migrated draft does not match the current schema.');
 validateGalleryReferences(value.gallery);
 const artworks=new Map(value.gallery.artworks.map(work=>[work.id,work]));
 for(const [id,revision] of Object.entries(value.masters)) if(!artworks.has(id) || (artworks.get(id).offer && artworks.get(id).offer.revision!==revision)) throw new Error('The migrated private mapping differs from its artwork.');
 database.prepare('UPDATE draft SET revision=?,body=? WHERE id=1').run(row.revision+1,Buffer.from(JSON.stringify(value)));
 database.exec('COMMIT');
 process.stdout.write(JSON.stringify({draftEtag:`"draft-${row.revision+1}"`})+'\n');
} catch(error) {database.exec('ROLLBACK'); throw error;}
finally {database.close();}
