// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

test('generated article and gallery routes survive direct HTTP navigation', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const output = mkdtempSync(join(tmpdir(), 'site-pages-'));
  const server = createServer((request, response) => {
    try { response.end(readFileSync(join(output, new URL(request.url, 'http://localhost').pathname, 'index.html'))); }
    catch { response.writeHead(404).end('Not found'); }
  });
  try {
    execFileSync(process.execPath, ['scripts/site/build.mjs', output], { cwd: root });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const source = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
    for (const article of source.articles.items.filter(item => item.status === 'live')) {
      const response = await fetch(`${origin}/articles/${article.slug}/`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(article.title.replaceAll('&', '&amp;')));
      assert.ok(html.includes(article.source.url));
      assert.match(html, /<head>\s*<script defer src="https:\/\/loopaware/);
      assert.ok(html.length > article.body.text.length / 2);
      assert.ok(!html.includes('subscription-widget'));
    }
    for (const kind of ['artworks', 'collections', 'exhibits']) {
      for (const item of source.gallery[kind]) assert.equal((await fetch(`${origin}/gallery/${kind}/${item.id}/`)).status, 200);
    }
    assert.equal((await fetch(`${origin}/articles/absent/`)).status, 404);
    const sitemap=readFileSync(join(output,'sitemap.xml'),'utf8');
    for(const article of source.articles.items) assert.ok(sitemap.includes(`/articles/${article.slug}/`));
    assert.ok(!sitemap.includes('/gallery/order/'));
    for(const project of source.projects.filter(project=>project.kind==='tool')) assert.equal((await fetch(origin+project.href)).status,200);
    const publicSite = JSON.parse(readFileSync(join(output, 'data/site.json'), 'utf8'));
    assert.ok(publicSite.articles.items.every(item => !('body' in item)));
    assert.equal(JSON.parse(readFileSync(join(output, 'config-site.json'), 'utf8')).apiOrigin, 'https://api.tyemirov.net');
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(output, { recursive: true, force: true }); }
});

test('new catalog albums generate pages without a manually authored route file', () => {
 const output=mkdtempSync(join(tmpdir(),'site-new-album-'));
 try {
  const source=JSON.parse(readFileSync('data/site.json','utf8'));
  const album=structuredClone(source.music.items[0]); album.slug='new-album'; album.title='A new catalog album';
  album.tracks.forEach((track,index)=>{track.id=`new-album-${index+1}`;});
  source.music.items.push(album);
  const input=join(output,'source.json');writeFileSync(input,JSON.stringify(source));
  execFileSync(process.execPath,['scripts/site/build.mjs',output,input]);
  assert.match(readFileSync(join(output,'music/new-album/index.html'),'utf8'),/<title>A new catalog album/);
 } finally {rmSync(output,{recursive:true,force:true});}
});

test('article catalog images are included without a body image reference', () => {
  const output = mkdtempSync(join(tmpdir(), 'site-article-image-'));
  try {
    const source = JSON.parse(readFileSync('data/site.json', 'utf8'));
    for (const article of source.articles.items) article.body.text = 'Complete article text without an inline image.';
    const input = join(output, 'source.json');
    writeFileSync(input, JSON.stringify(source));
    execFileSync(process.execPath, ['scripts/site/build.mjs', output, input]);
    for (const article of source.articles.items.filter(article => article.image)) {
      assert.deepEqual(readFileSync(join(output, article.image.src)), readFileSync(join(process.cwd(), article.image.src)));
    }
  } finally { rmSync(output, { recursive: true, force: true }); }
});
