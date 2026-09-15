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
const [websiteOrigin, apiOrigin] = ["LOCAL_WEBSITE_ORIGIN", "LOCAL_API_ORIGIN"].map((name) => {
  const value = process.env[name];
  if (!value || !/^http:\/\/localhost:[0-9]+$/.test(value)) throw new Error(`Supply ${name} as an HTTP localhost origin with a port.`);
  const origin = new URL(value);
  if (Number(value.slice(value.lastIndexOf(":") + 1)) < 1) throw new Error(`Supply a positive port in ${name}.`);
  return origin.origin;
});
if (websiteOrigin === apiOrigin) throw new Error("The local website and API origins must differ.");
const sharedConfig = JSON.parse(await readFile(join(publicSite, "config-ui.yaml"), "utf8"));
sharedConfig.environments[0].description = "Local";
sharedConfig.environments[0].origins = [websiteOrigin];
sharedConfig.environments[0].auth.tauthUrl = apiOrigin;
sharedConfig.environments[0].auth.tenantId = "tyemirov-gallery-development";
const sitePath = "data/site.json";
const indexName = "catalog.json";
const site = JSON.parse(await readFile(join(publicSite, sitePath), "utf8"));
/** @type {{ tracks: Record<string, { durationMs: number, file: string }> }} */
const index = JSON.parse(await readFile(join(sourceMedia, indexName), "utf8"));
for (const album of site.music.items) for (const track of album.tracks) {
  const record = index.tracks?.[track.id];
  if (!record) throw new Error(`Prepare track ${track.id}: missing local media in ${sourceMedia}.`);
  track.playback = { kind: "file", durationMs: record.durationMs };
}
const music = validateMusic(site.music);
const allowlist = JSON.stringify(playbackAllowlist(music), null, 2) + "\n";
await mkdir(localSite, { recursive: true });
await mkdir(localMedia, { recursive: true });
for (const record of Object.values(index.tracks)) await cp(join(sourceMedia, record.file), join(localMedia, record.file));
for (const entry of await readdir(localSite)) await rm(join(localSite, entry), { recursive: true, force: true });
await cp(publicSite, localSite, { recursive: true });
await writeFile(join(localSite, "config-site.json"), JSON.stringify({ apiOrigin }) + "\n");
await writeFile(join(localSite, "config-ui.yaml"), JSON.stringify(sharedConfig, null, 2) + "\n");
await writeFile(join(localSite, sitePath), JSON.stringify(site, null, 2) + "\n");
await writeFile(join(localSite, "music/playback-allowlist.json"), allowlist);
await writeFile(join(localMedia, "allowlist.json"), allowlist);
await writeFile(join(localMedia, indexName), JSON.stringify(index, null, 2) + "\n");
process.stdout.write(`Prepared ${music.items.reduce((count, album) => count + album.tracks.length, 0)} local tracks.\n`);
