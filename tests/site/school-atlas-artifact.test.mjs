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
      assert.match(html, /<mpr-header\b/);
      assert.match(html, /<mpr-footer\b/);
      assert.ok(html.includes(`https://tyemirov.net${path}`), path);
    }
    for (const asset of ['app.js', 'styles.css', 'value-calculation.js', 'school-data.js', 'private-school-data.js', 'public-options-data.js', 'vendor/d3.min.js', 'schools.csv', 'admissions-audit.csv', 'private-coverage.json']) {
      const response = await fetch(`${origin}/school-atlas/${asset}`);
      assert.equal(response.status, 200, asset);
      assert.ok((await response.text()).length > 0, asset);
    }
    assert.equal(existsSync(join(output, 'research')), false);
    assert.equal(existsSync(join(output, '.openai')), false);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(output, { recursive: true, force: true });
  }
});
