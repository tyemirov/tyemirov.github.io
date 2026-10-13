// @ts-check
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateSourceCatalog, publishCatalog } from '../../assets/js/catalog.js';

const root = resolve(import.meta.dirname, '../..');
const { values } = parseArgs({ options: {
  album: { type: 'string' },
  'media-root': { type: 'string' },
  'source-catalog': { type: 'string', default: join(root, 'data/site.json') },
}, strict: true });
const source = validateSourceCatalog(JSON.parse(await readFile(values['source-catalog'], 'utf8')));
const album = source.music.items.find(album => album.slug === values.album);
if (!album || album.status !== 'draft' || album.visibility !== 'unlisted') {
  throw new Error('Select one draft, unlisted album with --album.');
}
const draftMedia = resolve(values['media-root'] ?? join(root, '.local/music-drafts', album.slug));
const draftIndex = JSON.parse(await readFile(join(draftMedia, 'catalog.json'), 'utf8'));
const expectedIDs = album.tracks.map(track => track.id).sort();
if (!draftIndex || Object.keys(draftIndex).join() !== 'tracks' || !draftIndex.tracks ||
    JSON.stringify(Object.keys(draftIndex.tracks).sort()) !== JSON.stringify(expectedIDs)) {
  throw new Error('Preview media must contain exactly the selected album.');
}
for (const track of album.tracks) {
  const record = draftIndex.tracks[track.id];
  if (record.file !== `${track.id}.m4a` || track.playback.kind !== 'file' || record.durationMs !== track.playback.durationMs) {
    throw new Error(`Preview track ${track.id}: file or duration differs from the source catalog.`);
  }
}
const baseMedia = join(root, 'assets/music');
const baseIndex = JSON.parse(await readFile(join(baseMedia, 'catalog.json'), 'utf8'));
const production = publishCatalog(source);
const productionIDs = production.music.items.flatMap(album => album.tracks.filter(track => track.playback.kind === 'file').map(track => track.id)).sort();
if (JSON.stringify(Object.keys(baseIndex.tracks).sort()) !== JSON.stringify(productionIDs)) {
  throw new Error('Preview production media differs from the published catalog.');
}

const previewRoot = join(root, '.local/music-preview');
await mkdir(previewRoot, { recursive: true });
const directory = await mkdtemp(join(previewRoot, `${album.slug}-`));
const rawSite = join(directory, 'build');
const combinedMedia = join(directory, 'input-media');
const site = join(directory, 'site');
const media = join(directory, 'media');
const sourcePath = join(directory, 'source.json');
const websiteOrigin = 'http://localhost:18680';
const apiOrigin = 'http://localhost:18682';
function run(program, args, env = process.env, cwd = root) {
  return execFileSync(program, args, { cwd, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
try {
  album.status = 'live';
  await writeFile(sourcePath, JSON.stringify(source, null, 2) + '\n');
  run('bash', ['scripts/build-pages-artifact.sh'], { ...process.env, PAGES_DIST_DIR: rawSite });
  run(process.execPath, ['scripts/site/build.mjs', rawSite, sourcePath]);
  run(process.execPath, ['scripts/music/build.mjs', rawSite]);
  run(process.execPath, ['scripts/music/validate-artifact.mjs', rawSite]);

  await mkdir(combinedMedia);
  for (const [index, origin] of [[baseIndex, baseMedia], [draftIndex, draftMedia]]) {
    for (const record of Object.values(index.tracks)) await copyFile(join(origin, record.file), join(combinedMedia, record.file));
  }
  await writeFile(join(combinedMedia, 'catalog.json'), JSON.stringify({ tracks: { ...baseIndex.tracks, ...draftIndex.tracks } }, null, 2) + '\n');
  run(process.execPath, ['local/prepare.mjs', rawSite, combinedMedia, site, media], {
    ...process.env, LOCAL_WEBSITE_ORIGIN: websiteOrigin, LOCAL_API_ORIGIN: apiOrigin,
  });
  run('go', ['run', './cmd/music-media', 'validate', '--media-root', media,
    '--index', join(media, 'catalog.json'), '--allowlist', join(media, 'allowlist.json')], process.env, join(root, 'services/music-stream'));
  const receipt = { directory, site, media, websiteOrigin, apiOrigin, url: `${websiteOrigin}/music/${album.slug}/` };
  await writeFile(join(directory, 'preview.json'), JSON.stringify(receipt, null, 2) + '\n');
  // The complete local site and media remain; intermediate copies are disposable.
  await rm(rawSite, { recursive: true });
  await rm(combinedMedia, { recursive: true });
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
} catch (error) {
  await rm(directory, { recursive: true, force: true });
  throw error;
}
