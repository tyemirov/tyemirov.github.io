// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const cli = join(root, 'scripts/site/catalog.mjs');

function sourceCatalog() {
  return JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
}

function expectInvalid(mutators) {
  const dir = mkdtempSync(join(tmpdir(), 'site-ownership-'));
  try {
    const input = join(dir, 'input.json'), output = join(dir, 'public.json');
    for (const mutate of mutators) {
      const invalid = structuredClone(sourceCatalog());
      mutate(invalid);
      writeFileSync(input, JSON.stringify(invalid));
      const result = spawnSync(process.execPath, [cli, input, output], { cwd: root, encoding: 'utf8' });
      assert.notEqual(result.status, 0, 'obsolete ownership shape must fail validation');
      assert.match(result.stderr, /Validate catalog/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('every personal model carries Vadym Tyemirov ownership and the model kind', () => {
  const source = sourceCatalog();
  assert.equal(source.owner, 'vadym-tyemirov');
  assert.ok(source.projects.length > 0);
  for (const project of source.projects) {
    assert.equal(project.owner, 'vadym-tyemirov', `model ${project.slug} owner`);
    assert.equal(project.kind, 'model', `model ${project.slug} kind`);
    assert.ok(!('source' in project), `model ${project.slug} must not carry a source label`);
  }
  assert.ok(!('mprlab' in source), 'personal catalog must not carry an MPR Lab ownership block');
  assert.equal(source.software.href, 'https://mprlab.com');
});

test('the contract rejects MPR Lab ownership and obsolete project shapes', () => {
  expectInvalid([
    value => { delete value.owner; },
    value => { value.owner = 'mpr-lab'; },
    value => { value.gallery.owner = 'mpr-lab'; },
    value => { value.projects[0].owner = 'mpr-lab'; },
    value => { value.projects[0].kind = 'tool'; },
    value => { value.projects[0].source = 'MPR Lab'; },
    value => { value.mprlab = { label: 'Tools', blurb: 'Legacy ownership block.' }; },
  ]);
});

test('Modeling shows exactly the intended personal models', () => {
  const source = sourceCatalog();
  const modeling = source.projects
    .filter(project => project.status === 'live' && project.kicker === 'Modeling')
    .map(project => project.slug)
    .sort();
  assert.deepEqual(modeling, ['civilization', 'freedom', 'timeseries']);
  for (const project of source.projects.filter(project => project.status === 'live')) {
    assert.ok(existsSync(join(root, project.href, 'index.html')), `model page exists: ${project.href}`);
  }
});

test('the built catalog reaches every live album and every live model', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-reach-'));
  try {
    execFileSync(process.execPath, ['scripts/site/build.mjs', dir], { cwd: root, stdio: 'pipe' });
    const source = sourceCatalog();
    for (const album of source.music.items.filter(item => item.status === 'live')) {
      assert.ok(existsSync(join(dir, 'music', album.slug, 'index.html')), `album page: ${album.slug}`);
    }
    const modelsHtml = readFileSync(join(dir, 'models/index.html'), 'utf8');
    for (const project of source.projects.filter(item => item.status === 'live')) {
      assert.ok(modelsHtml.includes(`href="${project.href}"`), `models index links ${project.href}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the route manifest carries explicit parents without current-page links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-parents-'));
  try {
    execFileSync(process.execPath, ['scripts/site/build.mjs', dir], { cwd: root, stdio: 'pipe' });
    const routes = JSON.parse(readFileSync(join(dir, 'data/routes.json'), 'utf8'));
    const byPath = new Map(routes.map(route => [route.path, route]));
    assert.deepEqual(byPath.get('/models/').parent, null);
    for (const slug of ['civilization', 'decisioning', 'freedom', 'timeseries']) {
      assert.deepEqual(byPath.get(`/${slug}/`).parent, { label: 'Models', path: '/models/' });
    }
    assert.deepEqual(byPath.get('/articles/the-wittgenstein-mirror/').parent, { label: 'Articles', path: '/articles/' });
    assert.deepEqual(byPath.get('/music/soliloquies-vol-ii/').parent, { label: 'Music', path: '/music/' });
    const html = readFileSync(join(dir, 'civilization/index.html'), 'utf8');
    assert.ok(!html.includes('href="/civilization/"'), 'no current-page link in navigation');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
