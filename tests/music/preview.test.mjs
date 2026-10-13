// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local album preview selects one draft, validates audio, and preserves production inputs', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'album-preview-test-'));
  let output;
  const original = await readFile('data/site.json', 'utf8');
  const mediaOriginal = await readFile('assets/music/catalog.json', 'utf8');
  try {
    const source = JSON.parse(original);
    const draft = structuredClone(source.music.items.find(album => album.slug === 'ostatki-sladki-7c9e2b18'));
    draft.slug = 'preview-test-album';
    draft.status = 'draft';
    draft.tracks.forEach((track, index) => { track.id = `preview-test-${index + 1}`; });
    source.music.items.push(draft);
    const baseIndex = JSON.parse(mediaOriginal);
    const recording = Object.values(baseIndex.tracks)[0];
    const media = join(temporary, 'media');
    await mkdir(media);
    const tracks = {};
    for (const track of draft.tracks) {
      track.playback.durationMs = recording.durationMs;
      tracks[track.id] = { ...recording, file: `${track.id}.m4a` };
      await copyFile(join('assets/music', recording.file), join(media, tracks[track.id].file));
    }
    const secondDraft = structuredClone(draft);
    secondDraft.slug = 'another-private-album';
    secondDraft.tracks.forEach((track, index) => { track.id = `another-private-${index}`; });
    source.music.items.push(secondDraft);
    const input = join(temporary, 'source.json');
    await writeFile(input, JSON.stringify(source));
    const indexPath = join(media, 'catalog.json');
    await writeFile(indexPath, JSON.stringify({ tracks }));
    const args = ['scripts/music/preview.mjs', '--album', draft.slug, '--media-root', media, '--source-catalog', input];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    output = receipt.directory;
    const catalog = JSON.parse(await readFile(join(receipt.site, 'data/site.json'), 'utf8'));
    assert.equal(catalog.music.items.find(album => album.slug === draft.slug).status, 'live');
    assert.equal(catalog.music.items.find(album => album.slug === draft.slug).visibility, 'unlisted');
    assert.ok(!catalog.music.items.some(album => album.slug === secondDraft.slug));
    assert.deepEqual(JSON.parse(await readFile(join(receipt.site, 'config-site.json'), 'utf8')), { apiOrigin: 'http://localhost:18682' });
    const html = await readFile(join(receipt.site, 'music', draft.slug, 'index.html'), 'utf8');
    assert.match(html, /name="robots" content="noindex/);
    assert.ok(!(await readFile(join(receipt.site, 'music/index.html'), 'utf8')).includes(draft.slug));
    assert.ok(!(await readFile(join(receipt.site, 'sitemap.xml'), 'utf8')).includes(draft.slug));
    const index = JSON.parse(await readFile(join(receipt.media, 'catalog.json'), 'utf8'));
    assert.equal(Object.keys(index.tracks).length, Object.keys(baseIndex.tracks).length + 5);
    assert.equal(await readFile('data/site.json', 'utf8'), original);
    assert.equal(await readFile('assets/music/catalog.json', 'utf8'), mediaOriginal);

    for (const mutate of [
      value => { delete value[draft.tracks[0].id]; },
      value => { value['unexpected-track'] = recording; },
    ]) {
      const invalid = structuredClone(tracks);
      mutate(invalid);
      await writeFile(indexPath, JSON.stringify({ tracks: invalid }));
      const rejected = spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /exactly the selected album/);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
    if (output) await rm(output, { recursive: true, force: true });
  }
});
