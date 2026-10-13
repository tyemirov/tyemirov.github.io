// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

test('unlisted live albums retain direct pages and playback without public discovery', () => {
  const output = mkdtempSync(join(tmpdir(), 'site-unlisted-'));
  try {
    const source = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
    for (const album of source.music.items) album.visibility = 'listed';
    const unlisted = source.music.items.find(album => album.status === 'live' && album.tracks.some(track => track.playback.kind === 'file'));
    unlisted.visibility = 'unlisted';
    const draft = structuredClone(unlisted);
    draft.slug = 'unpublished-album';
    draft.status = 'draft';
    draft.coverImage = '/music/covers/unpublished-album.png';
    draft.tracks.forEach((track, index) => { track.id = `unpublished-album-${index + 1}`; });
    source.music.items.push(draft);
    const input = join(output, 'source.json');
    writeFileSync(input, JSON.stringify(source));
    execFileSync(process.execPath, ['scripts/site/build.mjs', output, input], { cwd: root });
    execFileSync(process.execPath, ['scripts/music/build.mjs', output], { cwd: root });
    const path = `/music/${unlisted.slug}/`;
    const detail = readFileSync(join(output, path, 'index.html'), 'utf8');
    assert.match(detail, /<meta name="robots" content="noindex">/);
    assert.ok(!detail.includes('"@type": "MusicAlbum"'));
    assert.ok(detail.includes(unlisted.title));
    assert.ok(!readFileSync(join(output, 'music/index.html'), 'utf8').includes(path));
    assert.ok(!readFileSync(join(output, 'index.html'), 'utf8').includes(path));
    assert.ok(!readFileSync(join(output, 'sitemap.xml'), 'utf8').includes(path));
    const routes = JSON.parse(readFileSync(join(output, 'data/routes.json'), 'utf8'));
    assert.ok(routes.some(route => route.path === path));
    const published = JSON.parse(readFileSync(join(output, 'data/site.json'), 'utf8'));
    assert.equal(published.music.items.find(album => album.slug === unlisted.slug).visibility, 'unlisted');
    assert.ok(!published.music.items.some(album => album.slug === draft.slug));
    assert.ok(!existsSync(join(output, 'music', draft.slug, 'index.html')));
    assert.ok(!existsSync(join(output, draft.coverImage)));
    assert.ok(!readFileSync(join(output, 'sitemap.xml'), 'utf8').includes(draft.slug));
    const allowlist = JSON.parse(readFileSync(join(output, 'music/playback-allowlist.json'), 'utf8'));
    const track = unlisted.tracks.find(track => track.playback.kind === 'file');
    assert.deepEqual(allowlist.tracks.find(item => item.id === track.id).playback, track.playback);
    assert.ok(!allowlist.tracks.some(item => draft.tracks.some(track => track.id === item.id)));
    const listed = source.music.items.find(album => album.status === 'live' && album.visibility === 'listed');
    assert.ok(readFileSync(join(output, 'music/index.html'), 'utf8').includes(`/music/${listed.slug}/`));
    assert.ok(readFileSync(join(output, 'sitemap.xml'), 'utf8').includes(`/music/${listed.slug}/`));
    assert.ok(readFileSync(join(output, 'music', listed.slug, 'index.html'), 'utf8').includes('"@type": "MusicAlbum"'));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('Pages artifact includes covers selected by the public catalog only', () => {
  const output = mkdtempSync(join(tmpdir(), 'site-selected-covers-'));
  try {
    execFileSync('bash', ['scripts/build-pages-artifact.sh'], {
      cwd: root,
      env: { ...process.env, PAGES_DIST_DIR: output },
    });
    const published = JSON.parse(readFileSync(join(output, 'data/site.json'), 'utf8'));
    const expected = [...new Set(published.music.items.map(album => basename(album.coverImage)))].sort();
    assert.deepEqual(readdirSync(join(output, 'music/covers')).sort(), expected);
    const source = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
    for (const draft of source.music.items.filter(album => album.status === 'draft')) {
      assert.ok(!published.music.items.some(album => album.slug === draft.slug));
      assert.ok(!existsSync(join(output, 'music', draft.slug, 'index.html')));
      assert.ok(!readFileSync(join(output, 'sitemap.xml'), 'utf8').includes(`/music/${draft.slug}/`));
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
