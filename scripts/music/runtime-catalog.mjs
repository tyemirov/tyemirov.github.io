// @ts-check
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { playbackAllowlist, validateMusic } from "../../music/catalog.js";

const [source, output, ...extra] = process.argv.slice(2);
if (!source || !output || extra.length) throw new Error("Supply the site catalog and runtime output directory.");
const site = JSON.parse(await readFile(source, "utf8"));
const allowlist = playbackAllowlist(validateMusic(site.music));
const hlsTracks = allowlist.tracks.filter(track => track.playback.kind === "hls");
if (hlsTracks.length) {
  throw new Error(`HLS tracks require prepared media in the deployment contract: ${hlsTracks.map(track => track.id).join(", ")}`);
}
await mkdir(output, { recursive: true });
await writeFile(join(output, "catalog.json"), JSON.stringify({ tracks: {} }) + "\n");
await writeFile(join(output, "allowlist.json"), JSON.stringify(allowlist, null, 2) + "\n");
