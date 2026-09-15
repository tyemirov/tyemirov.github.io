// @ts-check
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { playbackAllowlist, validateMusic } from "../../music/catalog.js";

const [source, mediaIndex, output, ...extra] = process.argv.slice(2);
if (!source || !mediaIndex || !output || extra.length) throw new Error("Supply the site catalog, prepared media index, and runtime output directory.");
const site = JSON.parse(await readFile(source, "utf8"));
const allowlist = playbackAllowlist(validateMusic(site.music));
const hlsTracks = allowlist.tracks.filter(track => track.playback.kind === "hls");
const index = JSON.parse(await readFile(mediaIndex, "utf8"));
if (!index || typeof index !== "object" || Object.keys(index).join() !== "tracks" || !index.tracks || typeof index.tracks !== "object" || Array.isArray(index.tracks)) {
  throw new Error(`Generate runtime catalog from ${mediaIndex}: invalid media index.`);
}
for (const track of hlsTracks) {
  const record = index.tracks[track.id];
  if (!record) throw new Error(`Generate runtime catalog for ${track.id}: missing prepared media.`);
  if (record.durationMs !== track.playback.durationMs) throw new Error(`Generate runtime catalog for ${track.id}: prepared duration differs from the public catalog.`);
}
if (Object.keys(index.tracks).length !== hlsTracks.length) throw new Error(`Generate runtime catalog from ${mediaIndex}: media index must contain exactly the published HLS tracks.`);
await mkdir(output, { recursive: true });
await writeFile(join(output, "catalog.json"), JSON.stringify(index, null, 2) + "\n");
await writeFile(join(output, "allowlist.json"), JSON.stringify(allowlist, null, 2) + "\n");
