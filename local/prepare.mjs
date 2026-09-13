// @ts-check
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { playbackAllowlist, validateMusic } from "../music/catalog.js";

const paths = process.argv.slice(2).map((path) => resolve(path));
if (paths.length !== 4) throw new Error("Supply public-site, source-media, local-site, and local-media directories.");
if (paths.some((path, index) => path === sep || paths.some((other, otherIndex) => index !== otherIndex && (path === other || path.startsWith(other + sep))))) {
  throw new Error("Local preparation requires four separate directories.");
}
const [publicSite, sourceMedia, localSite, localMedia] = paths;
const sitePath = "data/site.json";
const indexName = "selected.json";
const packagesName = "packages";
const site = JSON.parse(await readFile(join(publicSite, sitePath), "utf8"));
/** @type {{ tracks: Record<string, { durationMs: number }> }} */
const index = JSON.parse(await readFile(join(sourceMedia, indexName), "utf8"));
for (const album of site.music.items) for (const track of album.tracks) {
  const record = index.tracks?.[track.id];
  if (!record) throw new Error(`Prepare track ${track.id}: missing local media in ${sourceMedia}.`);
  track.playback = { kind: "hls", durationMs: record.durationMs };
}
const music = validateMusic(site.music);
const allowlist = JSON.stringify(playbackAllowlist(music), null, 2) + "\n";
await mkdir(localSite, { recursive: true });
await mkdir(localMedia, { recursive: true });
await cp(join(sourceMedia, packagesName), join(localMedia, packagesName), { recursive: true });
for (const entry of await readdir(localSite)) await rm(join(localSite, entry), { recursive: true, force: true });
await cp(publicSite, localSite, { recursive: true });
await writeFile(join(localSite, sitePath), JSON.stringify(site, null, 2) + "\n");
await writeFile(join(localSite, "music/playback-allowlist.json"), allowlist);
await writeFile(join(localMedia, "allowlist.json"), allowlist);
await writeFile(join(localMedia, indexName), JSON.stringify(index, null, 2) + "\n");
process.stdout.write(`Prepared ${music.items.reduce((count, album) => count + album.tracks.length, 0)} local tracks.\n`);
