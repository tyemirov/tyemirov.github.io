// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('the Pages artifact serves School Atlas and its evidence pages under the application prefix', async () => {
  const output = mkdtempSync(join(tmpdir(), 'school-atlas-artifact-'));
  const companion = 'https://vadymtyemirov1.substack.com/p/what-the-school-ranking-leaves-out';
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    try { response.end(readFileSync(join(output, path.endsWith('/') ? `${path}index.html` : path))); }
    catch { response.writeHead(404).end('Not found'); }
  });
  try {
    execFileSync('bash', ['scripts/build-pages-artifact.sh'], { env: { ...process.env, PAGES_DIST_DIR: output }, stdio: 'pipe' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/school-atlas/', '/school-atlas/admissions-audit.html', '/school-atlas/private-coverage.html']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, /<head>\s*<script defer src="https:\/\/loopaware/);
      assert.match(html, /<meta name="description" content="[^"]+">/, `${path}: search description`);
      if (path === '/school-atlas/') {
        const metadata = new Map([...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)">/g)].map(match => [match[1], match[2]]));
        assert.equal(metadata.get('og:description'), metadata.get('description'));
        assert.equal(metadata.get('twitter:card'), 'summary_large_image');
        assert.equal(metadata.get('twitter:title'), metadata.get('og:title'));
        assert.equal(metadata.get('twitter:description'), metadata.get('description'));
        assert.equal(metadata.get('og:image'), 'https://tyemirov.net/school-atlas/social-preview.jpg');
        assert.equal(metadata.get('twitter:image'), metadata.get('og:image'));
        assert.equal(metadata.get('og:image:width'), '1205');
        assert.equal(metadata.get('og:image:height'), '667');
        assert.equal(metadata.get('og:image:type'), 'image/jpeg');
        assert.ok(metadata.get('og:image:alt'));
        assert.equal(metadata.get('twitter:image:alt'), metadata.get('og:image:alt'));
        const preview = await fetch(`${origin}${new URL(metadata.get('og:image')).pathname}`);
        assert.equal(preview.status, 200);
        assert.deepEqual(Buffer.from(await preview.arrayBuffer()), readFileSync('school-atlas/social-preview.jpg'));
      }
      assert.match(html, /<mpr-header\b/);
      assert.match(html, /<mpr-footer\b/);
      assert.ok(html.includes(`https://tyemirov.net${path}`), path);
      assert.match(html, new RegExp(`<a[^>]+href="${companion}"[^>]*>Read companion article</a>`), `${path}: companion link`);
    }
    for (const asset of ['app.js', 'styles.css', 'value-calculation.js', 'school-data.js', 'private-school-data.js', 'public-options-data.js', 'vendor/d3.min.js', 'schools.csv', 'admissions-audit.csv', 'private-coverage.json']) {
      const response = await fetch(`${origin}/school-atlas/${asset}`);
      assert.equal(response.status, 200, asset);
      assert.ok((await response.text()).length > 0, asset);
    }
    const catalog = await (await fetch(`${origin}/data/site.json`)).json();
    const project = catalog.projects.find(project => project.slug === 'school-atlas');
    assert.equal(project.href, '/school-atlas/');
    assert.equal(project.sourceUrl, companion);
    assert.equal(project.kicker, 'Modeling');
    const routes = await (await fetch(`${origin}/data/routes.json`)).json();
    assert.deepEqual(routes.find(route => route.path === '/school-atlas/'), {
      path: '/school-atlas/', file: 'school-atlas/index.html', parent: { label: 'Articles', path: '/articles/' },
    });
    const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
    assert.equal(sitemap.match(/<loc>https:\/\/tyemirov\.net\/school-atlas\/<\/loc>/g)?.length, 1);
    const collection = await (await fetch(`${origin}/articles/`)).text();
    assert.ok(collection.includes('href="/school-atlas/"'));
    assert.ok(collection.includes(`href="${companion}"`));
    assert.equal(existsSync(join(output, 'research')), false);
    assert.equal(existsSync(join(output, '.openai')), false);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(output, { recursive: true, force: true });
  }
});
