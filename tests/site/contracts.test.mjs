// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const cli = join(root, 'scripts/site/catalog.mjs');

test('catalog CLI validates the complete source and produces only public records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-contract-'));
  try {
    const source = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
    assert.ok(source.articles.items.every(article => article.body.text.length > 1000));
    const draft = structuredClone(source.articles.items[0]);
    draft.id = 'private-draft'; draft.slug = 'private-draft'; draft.status = 'draft';
    draft.body.text = 'PRIVATE_DRAFT_TEXT';
    source.articles.items.push(draft);
    const {href,cta,sourceUrl,...hub}=structuredClone(source.projects[0]);
    source.projects.push({...hub,id:'article-series',slug:'article-series',kind:'series',parts:[{articleId:source.articles.items[0].id},{articleId:source.articles.items[1].id}]});
    const input = join(dir, 'input.json'), output = join(dir, 'public.json');
    writeFileSync(input, JSON.stringify(source));
    execFileSync(process.execPath, [cli, input, output], { cwd: root });
    const text = readFileSync(output, 'utf8'), published = JSON.parse(text);
    assert.equal(published.articles.items.length, source.articles.items.length - 1);
    assert.ok(published.articles.items.every(article => !('body' in article)));
    assert.ok(!text.includes('PRIVATE_DRAFT_TEXT'));
    for (const mutate of [
      value => { value.profile.image.jpg.secret = 'forbidden'; },
      value => { value.articles.items[0].body.text = ''; },
      value => { value.gallery.collections[0].artworkIds.push('absent-work'); },
      value => { value.articles.items[1].slug = value.articles.items[0].slug; },
      value => { value.music.items[0].releaseDate = '2026'; },
      value => { value.articles.items[0].slug='images'; },
      value => { value.projects.at(-1).parts[0].articleId='missing-article'; },
    ]) {
      const invalid = structuredClone(source); mutate(invalid);
      writeFileSync(input, JSON.stringify(invalid));
      const result = spawnSync(process.execPath, [cli, input, output], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Validate catalog/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('contract generation is reproducible and every application API operation has explicit responses', () => {
  execFileSync(process.execPath, ['scripts/contracts/generate.mjs', '--check'], { cwd: root });
  for (const name of ['music', 'gallery']) {
    const api = JSON.parse(readFileSync(join(root, `contracts/${name}.openapi.yaml`), 'utf8'));
    assert.match(api.openapi, /^3\.1\./);
    for (const [path, operations] of Object.entries(api.paths)) {
      assert.ok(path.startsWith(`/${name}/`));
      for (const operation of Object.values(operations)) {
        assert.ok(operation.operationId);
        assert.ok(Object.keys(operation.responses).some(code => /^2\d\d$/.test(code)));
        assert.ok(operation.responses['400'] || operation.responses.default);
      }
    }
  }
});
