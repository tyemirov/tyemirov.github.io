// @ts-check
import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateMusic, playbackAllowlist } from "../../music/catalog.js";
import { createPlaybackAPI } from "../../music/player/api.js";

const output = process.argv[2];
if (!output) throw new Error("Supply the Pages output directory.");
const root = resolve(output);
const forbidden = /(?:^|\/)(?:services|scripts|tests|node_modules|packages|indexes|staging|\.git|\.env(?:\.[^/]*)?)(?:\/|$)|\.(?:wav|flac|mp3|aac|m4a|m4s|m3u8|mp4|pem|key)$/i;
async function inspect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink() || forbidden.test(path) || path === "music/package.json" || path === "data/music.json") throw new Error(`Pages artifact contains private media or an excluded path: ${path}`);
    if (entry.isDirectory()) await inspect(join(directory, entry.name), path + "/");
  }
}
await inspect(root);
for (const path of ["site.js", "music/album.js", "music/music.js", "music/player.css", "music/dist/hls.LICENSE"]) await access(join(root, path));
const site = JSON.parse(await readFile(join(root, "data/site.json"), "utf8"));
const expected = playbackAllowlist(validateMusic(site.music));
const actual = JSON.parse(await readFile(join(root, "music/playback-allowlist.json"), "utf8"));
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Published playback allowlist differs from the catalog.");
createPlaybackAPI(JSON.parse(await readFile(join(root, "music/player-config.json"), "utf8")));
process.stdout.write("Pages music artifact validated.\n");
