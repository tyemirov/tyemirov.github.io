// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('the one-off draft migration preserves private mappings and changes the ETag once', () => {
 const directory=mkdtempSync(join(tmpdir(),'gallery-migration-'));
 try {
  const path=join(directory,'gallery.db'), database=new DatabaseSync(path);
  const catalog=JSON.parse(readFileSync('data/site.json','utf8')).gallery;
  const old=structuredClone(catalog); delete old.label; delete old.title; old.siteUrl='https://tyemirov.net/gallery/';
  const masters={[old.artworks[0].id]:'a'.repeat(64)};
  database.exec('CREATE TABLE draft(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,body BLOB NOT NULL); CREATE TABLE retained(value TEXT);');
  database.prepare('INSERT INTO retained VALUES(?)').run('purchase state');
  database.prepare('INSERT INTO draft VALUES(1,7,?)').run(Buffer.from(JSON.stringify({gallery:old,masters})));
  const run=()=>spawnSync(process.execPath,['scripts/site/migrate-gallery-draft.mjs',path,'data/site.json'],{encoding:'utf8'});
  const result=run(); assert.equal(result.status,0,result.stderr);
  const saved=database.prepare('SELECT revision,body FROM draft').get();
  assert.equal(saved.revision,8);
  assert.deepEqual(JSON.parse(Buffer.from(saved.body).toString()),{gallery:catalog,masters});
  assert.equal(database.prepare('SELECT value FROM retained').get().value,'purchase state');
  const repeated=run(); assert.notEqual(repeated.status,0); assert.match(repeated.stderr,/obsolete draft/);
  database.close();
 } finally {rmSync(directory,{recursive:true,force:true});}
});
