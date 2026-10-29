// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('every shipped HTML page uses the shared header theme contract before component initialization', () => {
  const output = mkdtempSync(join(tmpdir(), 'site-theme-artifact-'));
  try {
    execFileSync('bash', ['scripts/build-pages-artifact.sh'], { env: { ...process.env, PAGES_DIST_DIR: output }, stdio: 'pipe' });
    const htmlFiles = readdirSync(output, { recursive: true }).filter(file => file.endsWith('.html'));
    assert.ok(htmlFiles.length > 25);
    for (const file of htmlFiles) {
      const html = readFileSync(join(output, file), 'utf8');
      assert.match(html, /<head>\s*<script defer src="https:\/\/loopaware/);
      assert.equal([...html.matchAll(/<mpr-theme-toggle\b/g)].length, 1, file);
      assert.match(html, /<mpr-header\b[^>]*>[\s\S]*?<mpr-theme-toggle slot="aux"/, file);
      assert.match(html, /<mpr-footer\b[^>]*theme-config="[^"]*&quot;enabled&quot;:false/, file);
      assert.ok(html.indexOf('site-theme-bootstrap') < html.indexOf('rel="stylesheet"'), file);
      assert.match(html, /src="\/assets\/js\/theme.js"/, file);
      assert.match(html, /href="\/assets\/css\/theme.css"/, file);
      assert.doesNotMatch(html, /<meta name="color-scheme" content="dark"/, file);
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
